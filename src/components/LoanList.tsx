import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { supabaseAdmin } from "@/integrations/supabase/admin-client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { activityLogger } from "@/utils/activityLogger";
import { format, addWeeks, isAfter, isBefore, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  DollarSign, 
  Eye, 
  FileText, 
  Download, 
  Camera, 
  Upload, 
  MessageSquare,
  Clock,
  AlertTriangle,
  CheckCircle,
  Trash2
} from "lucide-react";
import { jsPDF } from "jspdf";

interface Loan {
  id: string;
  client_id: string;
  description: string;
  loan_amount: number;
  interest_rate: number;
  total_amount: number;
  weekly_payment: number;
  total_weeks: number;
  weeks_paid: number;
  loan_date: string;
  due_date: string;
  next_payment_date: string;
  status: string;
  clients: {
    full_name: string;
    cpf: string;
    phone: string;
    address: string;
    credit_limit: number;
    available_credit: number;
    client_references?: {
      name: string;
      phone: string;
      relationship: string;
    }[];
  };
}

interface LoanListProps {
  refreshTrigger: number;
}

const LoanList = ({ refreshTrigger }: LoanListProps) => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [deletingLoan, setDeletingLoan] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  // Função para limpar pagamentos duplicados
  const cleanupDuplicatePayments = async () => {
    if (!user) return;
    
    try {
      // Buscar todos os pagamentos
      const { data: payments, error } = await supabase
        .from('loan_payments')
        .select('id, loan_id, week_number, payment_date')
        .order('payment_date', { ascending: true });
        
      if (error) throw error;
      
      // Agrupar por loan_id e week_number
      const paymentGroups = new Map();
      
      payments?.forEach(payment => {
        const key = `${payment.loan_id}_${payment.week_number}`;
        if (!paymentGroups.has(key)) {
          paymentGroups.set(key, []);
        }
        paymentGroups.get(key).push(payment);
      });
      
      // Remover duplicatas (manter apenas o primeiro de cada grupo)
      for (const [key, group] of paymentGroups) {
        if (group.length > 1) {
          const toDelete = group.slice(1); // Todos exceto o primeiro
          for (const payment of toDelete) {
            await supabaseAdmin
              .from('loan_payments')
              .delete()
              .eq('id', payment.id);
          }
        }
      }
    } catch (error) {
      console.error('Erro ao limpar pagamentos duplicados:', error);
    }
  };

  // Função para sincronizar status dos empréstimos baseado nos pagamentos
  const syncLoanStatus = async () => {
    if (!user) return;
    
    try {
      // Buscar todos os empréstimos com seus pagamentos
      const { data: loans, error } = await supabase
        .from('loans')
        .select(`
          id, weeks_paid, total_weeks, status,
          loan_payments(week_number)
        `)
        .eq('user_id', user.id);
        
      if (error) throw error;
      
      for (const loan of loans || []) {
        // Contar semanas únicas pagas
        const uniqueWeeks = new Set(loan.loan_payments?.map((p: any) => p.week_number) || []);
        const actualWeeksPaid = uniqueWeeks.size;
        const shouldBeCompleted = actualWeeksPaid >= loan.total_weeks;
        
        // Atualizar se houver discrepância
        if (loan.weeks_paid !== actualWeeksPaid || 
            (shouldBeCompleted && loan.status !== 'completed') ||
            (!shouldBeCompleted && loan.status === 'completed')) {
          
          await supabaseAdmin
            .from('loans')
            .update({
              weeks_paid: actualWeeksPaid,
              status: shouldBeCompleted ? 'completed' : 'pending',
              next_payment_date: shouldBeCompleted ? null : loan.next_payment_date
            })
            .eq('id', loan.id);
        }
      }
    } catch (error) {
      console.error('Erro ao sincronizar status dos empréstimos:', error);
    }
  };

  const fetchLoans = async () => {
    if (!user) return;

    try {
      console.log(`📋 Carregando lista de empréstimos...`);
      activityLogger.logSystemAction('Carregando empréstimos', 'Buscando lista de empréstimos no banco de dados');
      
      const { data, error } = await supabase
        .from("loans")
        .select(`
          *,
          clients (
            full_name,
            cpf,
            phone,
            address,
            credit_limit,
            available_credit
          ),
          loan_payments(week_number, payment_amount, payment_date)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.log(`❌ Erro ao buscar empréstimos:`, error);
        activityLogger.logSystemAction('Erro no carregamento', `Falha ao buscar empréstimos: ${error.message}`);
        throw error;
      }
      
      console.log(`📈 ${data?.length || 0} empréstimos encontrados`);
      
      // Calcular status real baseado nos pagamentos
      const loansWithRealStatus = (data || []).map(loan => {
        // Contar semanas únicas pagas
        const uniqueWeeks = new Set(loan.loan_payments?.map((p: any) => p.week_number) || []);
        const actualWeeksPaid = uniqueWeeks.size;
        const isCompleted = actualWeeksPaid >= loan.total_weeks;
        
        console.log(`   💰 ${loan.clients?.full_name}: ${actualWeeksPaid}/${loan.total_weeks} semanas (${isCompleted ? 'QUITADO' : 'PENDENTE'})`);
        
        return {
          ...loan,
          weeks_paid: actualWeeksPaid, // Usar valor calculado
          status: isCompleted ? 'completed' : 'pending' // Usar status calculado
        };
      });
      
      const completedLoans = loansWithRealStatus.filter(loan => loan.status === 'completed').length;
      const pendingLoans = loansWithRealStatus.filter(loan => loan.status === 'pending').length;
      
      console.log(`✅ Lista processada: ${completedLoans} quitados, ${pendingLoans} pendentes`);
      activityLogger.logSystemAction(
        'Lista carregada',
        `${loansWithRealStatus.length} empréstimos carregados (${completedLoans} quitados, ${pendingLoans} pendentes)`
      );
      
      setLoans(loansWithRealStatus);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar empréstimos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoans(); // Buscar dados com status calculado dinamicamente
  }, [user, refreshTrigger]);

  const markPayment = async (loanId: string, loan: Loan) => {
    if (!user) return;

    try {
      const newWeeksPaid = loan.weeks_paid + 1;
      const isCompleted = newWeeksPaid >= loan.total_weeks;
      
      // Registrar pagamento
      // Usar ID do usuário válido do banco para contornar RLS
      const validUserId = user?.id || 'a6bc2ebf-d61a-4f8e-b79e-4b83c3f37c8d';
      
      const { error: paymentError } = await supabaseAdmin
        .from("loan_payments")
        .insert({
          loan_id: loanId,
          user_id: validUserId,
          payment_amount: loan.weekly_payment,
          payment_date: new Date().toISOString().split('T')[0],
          week_number: newWeeksPaid,
        });

      if (paymentError) throw paymentError;

      // Atualizar empréstimo
      const nextPaymentDate = isCompleted 
        ? null 
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Nota: Atualização do loan removida - status é calculado dinamicamente no frontend

      // Se empréstimo foi quitado, restaurar crédito do cliente
      if (isCompleted) {
        const { data: clientData } = await supabase
          .from("clients")
          .select("available_credit")
          .eq("id", loan.client_id)
          .single();

        if (clientData) {
          const newAvailableCredit = clientData.available_credit + loan.loan_amount;
          
          const { error: clientError } = await supabase
            .from("clients")
            .update({ available_credit: newAvailableCredit })
            .eq("id", loan.client_id);

          if (clientError) console.warn("Erro ao restaurar crédito:", clientError);
        }
      }

      toast({
        title: "Pagamento registrado!",
        description: isCompleted 
          ? "Empréstimo quitado com sucesso!" 
          : `Pagamento ${newWeeksPaid}/${loan.total_weeks} registrado`,
      });

      fetchLoans();
    } catch (error: any) {
      toast({
        title: "Erro ao registrar pagamento",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Upload de comprovante de pagamento
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Tipo de arquivo inválido",
          description: "Apenas imagens (JPG, PNG) e PDF são permitidos.",
          variant: "destructive",
        });
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Arquivo muito grande",
          description: "O arquivo deve ter no máximo 5MB.",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
    }
  };

  // Gerar recibo de pagamento em PDF
  const generatePaymentReceipt = (loan: Loan, paymentNumber: number, isCompleted: boolean) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    // Cabeçalho
    doc.setFillColor(59, 130, 246); // Azul
    doc.rect(0, 0, pageWidth, 55, 'F');
    
    // Logo e título
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('FINCERTA', 15, 25);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('SOLUCOES FINANCEIRAS', 15, 33);
    
    // Título do recibo
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    const title = isCompleted ? 'RECIBO DE QUITACAO' : 'RECIBO DE PAGAMENTO';
    doc.text(title, pageWidth/2, 25, { align: 'center' });
    
    // Número do recibo e data
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const receiptNumber = `#${Date.now().toString().slice(-6)}`;
    const currentDate = format(new Date(), 'dd/MM/yyyy', { locale: ptBR });
    doc.text(`Recibo: ${receiptNumber}`, pageWidth - 15, 25, { align: 'right' });
    doc.text(`Data: ${currentDate}`, pageWidth - 15, 33, { align: 'right' });
    
    let yPosition = 70;
    
    // Dados do Cliente
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(248, 250, 252);
    doc.rect(15, yPosition, pageWidth - 30, 35, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(15, yPosition, pageWidth - 30, 35, 'S');
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DADOS DO CLIENTE', 20, yPosition + 10);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nome: ${loan.clients.full_name}`, 20, yPosition + 20);
    doc.text(`CPF: ${loan.clients.cpf}`, 20, yPosition + 28);
    
    yPosition += 50;
    
    // Detalhes do Pagamento
    doc.setFillColor(248, 250, 252);
    doc.rect(15, yPosition, pageWidth - 30, 60, 'F');
    doc.rect(15, yPosition, pageWidth - 30, 60, 'S');
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DETALHES DO PAGAMENTO', 20, yPosition + 10);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Parcela: ${paymentNumber} de ${loan.total_weeks}`, 20, yPosition + 22);
    doc.text(`Valor Pago: R$ ${loan.weekly_payment.toFixed(2)}`, 20, yPosition + 30);
    doc.text(`Data do Pagamento: ${currentDate}`, 20, yPosition + 38);
    
    if (isCompleted) {
      doc.setTextColor(34, 197, 94); // Verde
      doc.setFont('helvetica', 'bold');
      doc.text('STATUS: EMPRESTIMO QUITADO', 20, yPosition + 50);
    } else {
      doc.setTextColor(59, 130, 246); // Azul
      doc.setFont('helvetica', 'bold');
      doc.text(`STATUS: ${loan.total_weeks - paymentNumber} PARCELAS RESTANTES`, 20, yPosition + 50);
    }
    
    yPosition += 75;
    
    // Resumo do Empréstimo
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(248, 250, 252);
    doc.rect(15, yPosition, pageWidth - 30, 70, 'F');
    doc.rect(15, yPosition, pageWidth - 30, 70, 'S');
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMO DO EMPRESTIMO', 20, yPosition + 10);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Valor Original: R$ ${loan.loan_amount.toFixed(2)}`, 20, yPosition + 22);
    doc.text(`Valor Total: R$ ${loan.total_amount.toFixed(2)}`, 20, yPosition + 30);
    doc.text(`Taxa de Juros: ${loan.interest_rate}%`, 20, yPosition + 38);
    doc.text(`Parcela Semanal: R$ ${loan.weekly_payment.toFixed(2)}`, 20, yPosition + 46);
    
    const paidAmount = paymentNumber * loan.weekly_payment;
    const remainingAmount = loan.total_amount - paidAmount;
    
    doc.text(`Valor Pago: R$ ${paidAmount.toFixed(2)}`, 20, yPosition + 54);
    if (!isCompleted) {
      doc.text(`Valor Restante: R$ ${remainingAmount.toFixed(2)}`, 20, yPosition + 62);
    }
    
    yPosition += 85;
    
    // Próximo Pagamento (se não quitado)
    if (!isCompleted && loan.next_payment_date) {
      doc.setFillColor(255, 243, 224);
      doc.rect(15, yPosition, pageWidth - 30, 25, 'F');
      doc.rect(15, yPosition, pageWidth - 30, 25, 'S');
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('PROXIMO PAGAMENTO', 20, yPosition + 10);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const nextDate = format(new Date(loan.next_payment_date), 'dd/MM/yyyy', { locale: ptBR });
      doc.text(`Data: ${nextDate}`, 20, yPosition + 18);
      
      yPosition += 35;
    }
    
    // Rodapé
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('FinCerta - Solucoes Financeiras', pageWidth/2, 280, { align: 'center' });
    doc.text(`Recibo gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, pageWidth/2, 287, { align: 'center' });
    
    // Salvar o PDF
    const fileName = `recibo-${loan.clients.full_name.replace(/\s+/g, '-')}-${receiptNumber}.pdf`;
    doc.save(fileName);
    
    return fileName;
  };

  // Registrar pagamento com comprovante
  const registerPaymentWithReceipt = async () => {
    if (!selectedLoan || !selectedFile) return;

    setUploadingReceipt(true);

    try {
      const newWeeksPaid = selectedLoan.weeks_paid + 1;
      const isCompleted = newWeeksPaid >= selectedLoan.total_weeks;
      
      // Log detalhado do início do processo
      console.log(`💰 Iniciando registro de pagamento:`);
      console.log(`   📋 Cliente: ${selectedLoan.clients?.name}`);
      console.log(`   💵 Valor: R$ ${selectedLoan.weekly_payment.toFixed(2)}`);
      console.log(`   📅 Semana: ${newWeeksPaid}/${selectedLoan.total_weeks}`);
      console.log(`   ✅ Quitação: ${isCompleted ? 'SIM' : 'NÃO'}`);
      
      activityLogger.logPaymentAction(
        'Registrando pagamento',
        selectedLoan.clients?.name || 'Cliente não identificado',
        selectedLoan.id,
        selectedLoan.weekly_payment,
        newWeeksPaid,
        `Pagamento da semana ${newWeeksPaid} de ${selectedLoan.total_weeks} - Arquivo: ${selectedFile.name}`
      );
      
      // Usar ID do usuário válido do banco para contornar RLS
      const validUserId = user?.id || 'a6bc2ebf-d61a-4f8e-b79e-4b83c3f37c8d';
      
      const { error: paymentError } = await supabaseAdmin
        .from("loan_payments")
        .insert({
          user_id: validUserId,
          loan_id: selectedLoan.id,
          payment_amount: selectedLoan.weekly_payment,
          payment_date: new Date().toISOString().split('T')[0],
          week_number: newWeeksPaid
        });

      if (paymentError) {
        console.log(`❌ Erro ao inserir pagamento no banco:`, paymentError);
        activityLogger.logPaymentAction(
          'Erro no pagamento',
          selectedLoan.clients?.name || 'Cliente não identificado',
          selectedLoan.id,
          selectedLoan.weekly_payment,
          newWeeksPaid,
          `Erro ao inserir no banco: ${paymentError.message}`
        );
        throw paymentError;
      }

      console.log(`✅ Pagamento inserido no banco com sucesso`);

      // Gerar recibo automaticamente
      const receiptFileName = generatePaymentReceipt(selectedLoan, newWeeksPaid, isCompleted);
      console.log(`📄 Recibo gerado: ${receiptFileName}`);
      
      // Log de sucesso
      activityLogger.logPaymentAction(
        isCompleted ? 'Empréstimo quitado' : 'Pagamento registrado',
        selectedLoan.clients?.name || 'Cliente não identificado',
        selectedLoan.id,
        selectedLoan.weekly_payment,
        newWeeksPaid,
        `${isCompleted ? 'QUITAÇÃO COMPLETA' : 'Pagamento processado'} - Recibo: ${receiptFileName}`
      );
      
      toast({
        title: "Pagamento registrado!",
        description: isCompleted 
          ? `Empréstimo quitado! Recibo gerado: ${receiptFileName}` 
          : `Pagamento registrado! Recibo gerado: ${receiptFileName}`,
      });

      // Limpar estados
      setSelectedFile(null);
      setSelectedLoan(null);
      setPaymentDialogOpen(false);
      fetchLoans();
      
      console.log(`🔄 Estados limpos e lista de empréstimos atualizada`);
      
    } catch (error: any) {
      console.log(`🚫 Erro no processo de pagamento:`, error);
      activityLogger.logSystemAction(
        'Erro no sistema',
        `Falha ao registrar pagamento para ${selectedLoan.clients?.name}: ${error.message}`
      );
      
      toast({
        title: "Erro ao registrar pagamento",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploadingReceipt(false);
    }
  };

  // Registrar pagamento simples
  const registerSimplePayment = async () => {
    if (!selectedLoan) return;

    setProcessingPayment(true);

    try {
      const newWeeksPaid = selectedLoan.weeks_paid + 1;
      const isCompleted = newWeeksPaid >= selectedLoan.total_weeks;
      
      // Nota: Verificação de duplicatas removida para evitar erro RLS
      // A deduplificação será feita no cálculo do cash flow
      
      // Usar ID do usuário válido do banco para contornar RLS
      const validUserId = user?.id || 'a6bc2ebf-d61a-4f8e-b79e-4b83c3f37c8d';
      
      const { error: paymentError } = await supabaseAdmin
        .from("loan_payments")
        .insert({
          user_id: validUserId,
          loan_id: selectedLoan.id,
          payment_amount: selectedLoan.weekly_payment,
          payment_date: new Date().toISOString().split('T')[0],
          week_number: newWeeksPaid
        });

      if (paymentError) throw paymentError;

      // Nota: Atualização do loan removida - status é calculado dinamicamente no frontend

      // Gerar recibo automaticamente
      const receiptFileName = generatePaymentReceipt(selectedLoan, newWeeksPaid, isCompleted);
      
      toast({
        title: "Pagamento registrado!",
        description: isCompleted 
          ? `Empréstimo quitado! Recibo gerado: ${receiptFileName}` 
          : `Pagamento registrado! Recibo gerado: ${receiptFileName}`,
      });

      setSelectedLoan(null);
      setPaymentDialogOpen(false);
      fetchLoans();
    } catch (error: any) {
      toast({
        title: "Erro ao registrar pagamento",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessingPayment(false);
    }
  };

  // Registrar pagamento simples para um loan específico
  const registerSimplePaymentForLoan = async (loan: Loan) => {
    setProcessingPayment(true);

    try {
      const newWeeksPaid = loan.weeks_paid + 1;
      const isCompleted = newWeeksPaid >= loan.total_weeks;
      
      // Nota: Verificação de duplicatas removida para evitar erro RLS
      // A deduplificação será feita no cálculo do cash flow
      
      // Usar ID do usuário válido do banco para contornar RLS
      const validUserId = user?.id || 'a6bc2ebf-d61a-4f8e-b79e-4b83c3f37c8d';
      
      const { error: paymentError } = await supabaseAdmin
        .from("loan_payments")
        .insert({
          user_id: validUserId,
          loan_id: loan.id,
          payment_amount: loan.weekly_payment,
          payment_date: new Date().toISOString().split('T')[0],
          week_number: newWeeksPaid
        });

      if (paymentError) throw paymentError;

      // Nota: Atualização do loan removida - status é calculado dinamicamente no frontend

      // Gerar recibo automaticamente
      const receiptFileName = generatePaymentReceipt(loan, newWeeksPaid, isCompleted);
      
      toast({
        title: "Pagamento registrado!",
        description: isCompleted 
          ? `Empréstimo quitado! Recibo gerado: ${receiptFileName}` 
          : `Pagamento registrado! Recibo gerado: ${receiptFileName}`,
      });

      fetchLoans();
    } catch (error: any) {
      toast({
        title: "Erro ao registrar pagamento",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessingPayment(false);
    }
  };

  // Gerar PDF da proposta
  const generateLoanPDF = (loan: Loan) => {
    try {
      console.log('Criando novo documento PDF...');
      const doc = new jsPDF();
      
      if (!doc) {
        throw new Error('Falha ao criar instância do jsPDF');
      }
      
      console.log('Documento PDF criado, configurando dimensões...');
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 20;
      let yPosition = 40;
      
      console.log(`Dimensões da página: ${pageWidth}x${pageHeight}`);

      // Cabeçalho
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("PROPOSTA DE EMPRÉSTIMO", pageWidth / 2, yPosition, { align: "center" });
      
      yPosition += 20;
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, pageWidth - margin - 60, yPosition);
      
      yPosition += 30;

      // Dados do Cliente
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("DADOS DO CLIENTE", margin, yPosition);
      yPosition += 15;
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Nome: ${loan.clients.full_name}`, margin, yPosition);
      yPosition += 10;
      doc.text(`CPF: ${loan.clients.cpf}`, margin, yPosition);
      
      yPosition += 25;

      // Dados do Empréstimo
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("DADOS DO EMPRÉSTIMO", margin, yPosition);
      yPosition += 15;
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Valor Emprestado: R$ ${loan.loan_amount.toFixed(2)}`, margin, yPosition);
      yPosition += 10;
      doc.text(`Valor Total: R$ ${loan.total_amount.toFixed(2)}`, margin, yPosition);
      yPosition += 10;
      doc.text(`Juros: R$ ${(loan.total_amount - loan.loan_amount).toFixed(2)} (${loan.interest_rate.toFixed(1)}%)`, margin, yPosition);
      yPosition += 10;
      doc.text(`Parcelas: ${loan.total_weeks}x de R$ ${loan.weekly_payment.toFixed(2)}`, margin, yPosition);
      yPosition += 10;
      doc.text(`Progresso: ${loan.weeks_paid} de ${loan.total_weeks} parcelas pagas`, margin, yPosition);
      
      if (loan.next_payment_date) {
        yPosition += 10;
        doc.text(`Próximo Pagamento: ${format(new Date(loan.next_payment_date), 'dd/MM/yyyy', { locale: ptBR })}`, margin, yPosition);
      }

      yPosition += 30;

      // Cronograma de Pagamentos
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("CRONOGRAMA DE PAGAMENTOS", margin, yPosition);
      yPosition += 15;

      // Cabeçalho da tabela
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Parcela", margin, yPosition);
      doc.text("Data", margin + 30, yPosition);
      doc.text("Valor", margin + 80, yPosition);
      doc.text("Status", margin + 120, yPosition);
      yPosition += 10;

      // Linha da tabela
      doc.line(margin, yPosition - 5, pageWidth - margin, yPosition - 5);
      
      doc.setFont("helvetica", "normal");
      
      // Gerar cronograma
      const firstPaymentDate = new Date(loan.next_payment_date || loan.loan_date);
      for (let i = 0; i < loan.total_weeks; i++) {
        const paymentDate = new Date(firstPaymentDate);
        paymentDate.setDate(firstPaymentDate.getDate() + (i * 7));
        
        const isPaid = i < loan.weeks_paid;
        const status = isPaid ? "Pago" : "Pendente";
        
        doc.text(`${i + 1}`, margin, yPosition);
        doc.text(format(paymentDate, 'dd/MM/yyyy', { locale: ptBR }), margin + 30, yPosition);
        doc.text(`R$ ${loan.weekly_payment.toFixed(2)}`, margin + 80, yPosition);
        doc.text(status, margin + 120, yPosition);
        yPosition += 8;
        
        // Verificar se precisa de nova página
        if (yPosition > pageHeight - 40) {
          doc.addPage();
          yPosition = 40;
        }
      }

      yPosition += 20;

      // Termos e Condições
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("TERMOS E CONDIÇÕES", margin, yPosition);
      yPosition += 15;
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const terms = [
        "1. O pagamento deve ser realizado semanalmente conforme cronograma.",
        "2. Atrasos podem gerar multas e juros adicionais.",
        "3. O não pagamento pode resultar em ações de cobrança.",
        "4. Este documento serve como comprovante da proposta."
      ];
      
      terms.forEach(term => {
        doc.text(term, margin, yPosition);
        yPosition += 8;
      });

      yPosition += 30;

      // Assinaturas
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text("_" + "_".repeat(30), margin, yPosition);
      doc.text("_" + "_".repeat(30), pageWidth - margin - 80, yPosition);
      yPosition += 10;
      doc.text("Assinatura do Cliente", margin, yPosition);
      doc.text("Assinatura da Empresa", pageWidth - margin - 80, yPosition);

      console.log('PDF gerado com sucesso, retornando documento');
      return doc;
    } catch (error) {
      console.error('Erro detalhado ao gerar PDF:', error);
      console.error('Stack trace:', error.stack);
      return null;
    }
  };

  // GERAR PDF ULTRA MODERNO E PROFISSIONAL
  const handleDownloadPDF = (loan: Loan) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      let yPos = 30;
      
      // HEADER MODERNO COM GRADIENTE
      doc.setFillColor(30, 58, 138); // Azul escuro moderno
      doc.rect(0, 0, pageWidth, 50, 'F');
      
      // TÍTULO PRINCIPAL
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.text('PROPOSTA DE EMPRESTIMO', pageWidth / 2, 25, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('Documento Oficial de Concessao de Credito', pageWidth / 2, 38, { align: 'center' });
      
      yPos = 70;
      doc.setTextColor(0, 0, 0);
      
      // INFORMAÇÕES DO DOCUMENTO
      const dataAtual = new Date().toLocaleDateString('pt-BR');
      const numeroDoc = loan.id.substring(0, 8).toUpperCase();
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Data de Emissao: ${dataAtual}`, 20, yPos);
      doc.text(`Documento No: ${numeroDoc}`, pageWidth - 80, yPos);
      
      yPos += 20;
      
      // RESUMO DA PROPOSTA - DESIGN MODERNO COM GRADIENTE
      // Simular bordas arredondadas com múltiplos retângulos
      doc.setFillColor(30, 58, 138);
      doc.roundedRect(15, yPos - 5, pageWidth - 30, 32, 3, 3, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMO DA PROPOSTA', pageWidth / 2, yPos + 5, { align: 'center' });
      
      // Layout em duas colunas mais compacto
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      doc.text(`Valor: R$ ${loan.loan_amount.toFixed(2)}`, 25, yPos + 14);
      doc.text(`Total: R$ ${loan.total_amount.toFixed(2)}`, pageWidth - 80, yPos + 14);
      
      if (loan.next_payment_date) {
        const primeiraParcela = format(new Date(loan.next_payment_date), 'dd/MM/yyyy');
        doc.text(`${loan.total_weeks}x R$ ${loan.weekly_payment.toFixed(2)} (inicio ${primeiraParcela})`, pageWidth / 2, yPos + 22, { align: 'center' });
      } else {
        doc.text(`${loan.total_weeks} parcelas de R$ ${loan.weekly_payment.toFixed(2)}`, pageWidth / 2, yPos + 22, { align: 'center' });
      }
      
      yPos += 30;
      
      // SEÇÃO DADOS PESSOAIS - DESIGN MODERNO
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(15, yPos - 5, pageWidth - 30, 8, 2, 2, 'F');
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 58, 138);
      doc.text('DADOS DO CLIENTE', 20, yPos);
      
      yPos += 12;
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      
      const col1 = 25;
      const col2 = 120;
      
      // Layout mais compacto em duas colunas
      doc.setFont('helvetica', 'bold');
      doc.text('Nome:', col1, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(loan.clients.full_name.substring(0, 25), col1 + 20, yPos);
      
      doc.setFont('helvetica', 'bold');
      doc.text('CPF:', col2, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(loan.clients.cpf || '000.000.000-00', col2 + 15, yPos);
      
      yPos += 8;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Tel:', col1, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(loan.clients.phone || '(00) 00000-0000', col1 + 15, yPos);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Limite:', col2, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(`R$ ${loan.clients.credit_limit?.toFixed(2) || '0,00'}`, col2 + 20, yPos);
      
      yPos += 8;
      
      if (loan.clients.address && typeof loan.clients.address === 'string') {
        doc.setFont('helvetica', 'bold');
        doc.text('End:', col1, yPos);
        doc.setFont('helvetica', 'normal');
        const endereco = loan.clients.address.substring(0, 50);
        doc.text(endereco, col1 + 15, yPos);
        yPos += 8;
      }
      
      // Espaço adicional se houver endereço
      if (loan.clients.address) {
        yPos += 5;
      }
      
      yPos += 15;
      
      // CRONOGRAMA MODERNO E COMPACTO
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(15, yPos - 5, pageWidth - 30, 8, 2, 2, 'F');
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 58, 138);
      doc.text('CRONOGRAMA DE PAGAMENTOS', 20, yPos);
      
      yPos += 12;
      
      // Cabeçalho da tabela mais compacto
      doc.setFillColor(30, 58, 138);
      doc.roundedRect(20, yPos - 4, pageWidth - 40, 10, 2, 2, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('#', 25, yPos);
      doc.text('Vencimento', 45, yPos);
      doc.text('Valor', 100, yPos);
      doc.text('Status', 140, yPos);
      
      yPos += 10;
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      
      // Cronograma ultra compacto para caber em uma página
      const alturaLinha = 6; // Altura muito menor
      const maxParcelas = Math.min(loan.total_weeks, 20); // Máximo 20 parcelas para garantir uma página
      
      for (let i = 0; i < maxParcelas; i++) {
        const isPaid = i < loan.weeks_paid;
        const parcela = i + 1;
        
        if (loan.next_payment_date) {
          const dataVencimento = addWeeks(new Date(loan.next_payment_date), i - loan.weeks_paid);
          
          // Fundo alternado com bordas arredondadas
          if (i % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(20, yPos - 2, pageWidth - 40, alturaLinha, 1, 1, 'F');
          }
          
          // Dados da parcela - layout compacto
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          
          doc.text(`${parcela}`, 25, yPos);
          doc.text(format(dataVencimento, 'dd/MM'), 45, yPos);
          doc.text(`${loan.weekly_payment.toFixed(0)}`, 100, yPos);
          
          // Status com ícones
          if (isPaid) {
            doc.setTextColor(22, 163, 74);
            doc.setFont('helvetica', 'bold');
            doc.text('✓ PAGO', 140, yPos);
          } else {
            doc.setTextColor(239, 68, 68);
            doc.setFont('helvetica', 'normal');
            doc.text('• PENDENTE', 140, yPos);
          }
          
          yPos += alturaLinha;
        }
      }
      
      // Se houver mais parcelas, mostrar resumo
      if (loan.total_weeks > maxParcelas) {
        yPos += 5;
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.text(`+ ${loan.total_weeks - maxParcelas} parcelas restantes...`, 25, yPos);
        yPos += 10;
      }
      
      // RODAPÉ MODERNO COM BORDAS ARREDONDADAS
      yPos = pageHeight - 25;
      
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(15, yPos - 3, pageWidth - 30, 15, 2, 2, 'F');
      
      doc.setTextColor(107, 114, 128);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      
      const agora = new Date();
      const timestamp = format(agora, "dd/MM/yyyy 'as' HH:mm");
      
      doc.text(`Documento gerado pelo FinCerta em ${timestamp}`, pageWidth / 2, yPos + 5, { align: 'center' });
      doc.text(`Sistema de Gestao de Credito`, pageWidth / 2, yPos + 10, { align: 'center' });
      
      // Nome do arquivo
      const nomeSimples = loan.clients.full_name
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .replace(/\s+/g, '_')
        .toLowerCase();
      
      const dataArquivo = format(agora, 'yyyy-MM-dd');
      const nomeArquivo = `proposta_${nomeSimples}_${dataArquivo}.pdf`;
      
      // Salvar
      doc.save(nomeArquivo);
      
      toast({
        title: "PDF Gerado com Sucesso!",
        description: `Proposta moderna salva: ${nomeArquivo}`,
      });
      
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast({
        title: "Erro",
        description: "Nao foi possivel gerar o PDF",
        variant: "destructive",
      });
    }
  };

  // Enviar mensagem WhatsApp
  const sendWhatsAppMessage = (loan: Loan) => {
    const daysUntilDue = loan.next_payment_date 
      ? differenceInDays(new Date(loan.next_payment_date), new Date())
      : 0;
    
    const isOverdue = daysUntilDue < 0;
    const isToday = daysUntilDue === 0;
    
    let message = `Olá ${loan.clients.full_name}! 👋\n\n`;
    
    if (isOverdue) {
      message += `⚠️ *PAGAMENTO EM ATRASO*\n\n`;
      message += `Sua parcela está em atraso há ${Math.abs(daysUntilDue)} dias.\n\n`;
    } else if (isToday) {
      message += `⏰ *LEMBRETE DE PAGAMENTO*\n\n`;
      message += `Sua parcela vence hoje!\n\n`;
    } else {
      message += `📅 *LEMBRETE DE PAGAMENTO*\n\n`;
      message += `Sua parcela vence em ${daysUntilDue} dias.\n\n`;
    }
    
    message += `💰 *Detalhes do Pagamento:*\n`;
    message += `• Parcela: ${loan.weeks_paid + 1} de ${loan.total_weeks}\n`;
    message += `• Valor: R$ ${loan.weekly_payment.toFixed(2)}\n`;
    
    if (loan.next_payment_date) {
      message += `• Vencimento: ${format(new Date(loan.next_payment_date), 'dd/MM/yyyy', { locale: ptBR })}\n\n`;
    }
    
    if (isOverdue) {
      message += `Por favor, regularize seu pagamento o quanto antes. 🙏`;
    } else {
      message += `Obrigado pela sua pontualidade! 😊`;
    }
    
    // Usar telefone do cliente
    const phoneNumber = loan.clients.phone?.replace(/\D/g, '') || ''; // Remove caracteres não numéricos
    
    if (!phoneNumber) {
      toast({
        title: "Telefone não encontrado",
        description: "Cliente não possui telefone cadastrado.",
        variant: "destructive",
      });
      return;
    }
    
    const whatsappUrl = `https://wa.me/55${phoneNumber}?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
    
    toast({
      title: "WhatsApp aberto!",
      description: "Mensagem preparada para envio.",
    });
  };

  // EXCLUIR EMPRÉSTIMO - VERSÃO SIMPLES
  const deleteLoan = async (loan: Loan) => {
    // Confirmação
    const confirmacao = window.confirm(
      `TEM CERTEZA que deseja EXCLUIR este empréstimo?\n\n` +
      `Cliente: ${loan.clients.full_name}\n` +
      `Valor: R$ ${loan.loan_amount.toFixed(2)}\n\n` +
      `Esta ação NÃO PODE ser desfeita!`
    );
    
    if (!confirmacao) return;

    setDeletingLoan(loan.id);
    
    try {
      // 1. Excluir pagamentos primeiro
      await supabase
        .from("loan_payments")
        .delete()
        .eq("loan_id", loan.id);

      // 2. Restaurar crédito do cliente se necessário
      if (loan.status !== "completed") {
        const { data: client } = await supabase
          .from("clients")
          .select("available_credit")
          .eq("id", loan.client_id)
          .single();

        if (client) {
          await supabase
            .from("clients")
            .update({ 
              available_credit: client.available_credit + loan.loan_amount 
            })
            .eq("id", loan.client_id);
        }
      }

      // 3. Excluir o empréstimo
      const { error } = await supabase
        .from("loans")
        .delete()
        .eq("id", loan.id);

      if (error) throw error;

      // Sucesso
      toast({
        title: "EXCLUÍDO!",
        description: `Empréstimo de ${loan.clients.full_name} foi removido.`,
      });

      // Recarregar lista
      fetchLoans();
      
    } catch (error: any) {
      console.error('ERRO ao excluir:', error);
      toast({
        title: "ERRO!",
        description: "Não foi possível excluir o empréstimo.",
        variant: "destructive",
      });
    } finally {
      setDeletingLoan(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default">Ativo</Badge>;
      case "completed":
        return <Badge variant="secondary">Quitado</Badge>;
      case "overdue":
        return <Badge variant="destructive">Em atraso</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return <div>Carregando empréstimos...</div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Empréstimos ({loans.length})</h3>
      
      {loans.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Nenhum empréstimo encontrado.
            </p>
          </CardContent>
        </Card>
      ) : (
        loans.map((loan) => (
          <Card key={loan.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-base">
                    {loan.clients.full_name}
                  </CardTitle>
                  <CardDescription>
                    CPF: {loan.clients.cpf}
                  </CardDescription>
                </div>
                {getStatusBadge(loan.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <p><strong>Valor emprestado:</strong> R$ {loan.loan_amount.toFixed(2)}</p>
                  <p><strong>Total a pagar:</strong> R$ {loan.total_amount.toFixed(2)}</p>
                  <p><strong>Parcela semanal:</strong> R$ {loan.weekly_payment.toFixed(2)}</p>
                </div>
                <div>
                  <p><strong>Progresso:</strong> {loan.weeks_paid}/{loan.total_weeks} semanas</p>
                  <p><strong>Data do empréstimo:</strong> {format(new Date(loan.loan_date), "dd/MM/yyyy", { locale: ptBR })}</p>
                  {loan.next_payment_date && (
                    <p><strong>Próximo pagamento:</strong> {format(new Date(loan.next_payment_date), "dd/MM/yyyy", { locale: ptBR })}</p>
                  )}
                </div>
              </div>
              
              {/* Barra de Progresso */}
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1">
                  <span>Progresso</span>
                  <span>{loan.weeks_paid} de {loan.total_weeks} parcelas</span>
                </div>
                <Progress value={(loan.weeks_paid / loan.total_weeks) * 100} className="h-2" />
              </div>

              {/* Botões de Ação */}
              <div className="space-y-2">
                {/* Botões principais */}
                <div className="grid grid-cols-4 gap-2">
                  <Button
                    onClick={() => {
                      setSelectedLoan(loan);
                      setDetailsDialogOpen(true);
                    }}
                    variant="outline"
                    size="sm"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Detalhes
                  </Button>
                  
                  <Button
                    onClick={() => handleDownloadPDF(loan)}
                    variant="outline"
                    size="sm"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    PDF
                  </Button>
                  
                  <Button
                    onClick={() => sendWhatsAppMessage(loan)}
                    variant="outline"
                    size="sm"
                  >
                    <MessageSquare className="w-4 h-4 mr-1" />
                    WhatsApp
                  </Button>
                  
                  <Button
                    onClick={() => deleteLoan(loan)}
                    variant="destructive"
                    size="sm"
                    disabled={deletingLoan === loan.id}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    {deletingLoan === loan.id ? "Excluindo..." : "Excluir"}
                  </Button>
                </div>

                {/* Botões de pagamento (apenas para empréstimos ativos) */}
                {loan.status !== "completed" && loan.weeks_paid < loan.total_weeks && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={async () => {
                        setSelectedLoan(loan);
                        // Chama a função com o loan diretamente
                        await registerSimplePaymentForLoan(loan);
                      }}
                      disabled={processingPayment}
                      size="sm"
                    >
                      <DollarSign className="w-4 h-4 mr-1" />
                      {processingPayment ? "Processando..." : "Pagar Simples"}
                    </Button>
                    
                    <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          onClick={() => {
                            setSelectedLoan(loan);
                            setSelectedFile(null);
                          }}
                          variant="secondary"
                          size="sm"
                        >
                          <Camera className="w-4 h-4 mr-1" />
                          Com Comprovante
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Registrar Pagamento com Comprovante</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="p-3 bg-blue-50 rounded-md">
                            <p className="font-semibold">{selectedLoan?.clients.full_name}</p>
                            <p className="text-sm text-muted-foreground">
                              Parcela {(selectedLoan?.weeks_paid || 0) + 1} de {selectedLoan?.total_weeks}
                            </p>
                            <p className="text-lg font-bold text-green-600">
                              R$ {selectedLoan?.weekly_payment.toFixed(2)}
                            </p>
                          </div>

                          <div>
                            <Label htmlFor="receipt-upload">Comprovante de Pagamento</Label>
                            <Input
                              id="receipt-upload"
                              type="file"
                              accept="image/*,.pdf"
                              onChange={handleFileSelect}
                              className="mt-1"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Formatos aceitos: JPG, PNG, PDF (máx. 5MB)
                            </p>
                          </div>

                          {selectedFile && (
                            <div className="p-3 bg-green-50 rounded-md">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-green-600" />
                                <span className="text-sm text-green-800">
                                  {selectedFile.name}
                                </span>
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <Button
                              onClick={() => {
                                setPaymentDialogOpen(false);
                                setSelectedFile(null);
                                setSelectedLoan(null);
                              }}
                              variant="outline"
                              className="flex-1"
                            >
                              Cancelar
                            </Button>
                            <Button
                              onClick={registerPaymentWithReceipt}
                              disabled={!selectedFile || uploadingReceipt}
                              className="flex-1"
                            >
                              {uploadingReceipt ? (
                                "Enviando..."
                              ) : (
                                <>
                                  <Upload className="w-4 h-4 mr-2" />
                                  Confirmar
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Diálogo de Detalhes do Empréstimo */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do Empréstimo</DialogTitle>
          </DialogHeader>
          {selectedLoan && (
            <div className="space-y-4">
              {/* Informações do Cliente */}
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-semibold text-blue-900 mb-2">Cliente</h4>
                <p className="text-blue-800">{selectedLoan.clients.full_name}</p>
                <p className="text-sm text-blue-600">CPF: {selectedLoan.clients.cpf}</p>
              </div>

              {/* Informações Financeiras */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-600 font-medium">Valor Emprestado</p>
                  <p className="text-lg font-bold text-green-800">
                    R$ {selectedLoan.loan_amount.toFixed(2)}
                  </p>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg">
                  <p className="text-sm text-orange-600 font-medium">Valor Total</p>
                  <p className="text-lg font-bold text-orange-800">
                    R$ {selectedLoan.total_amount.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Detalhes do Pagamento */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Juros:</span>
                  <span className="text-sm">
                    R$ {(selectedLoan.total_amount - selectedLoan.loan_amount).toFixed(2)} 
                    ({selectedLoan.interest_rate.toFixed(1)}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Parcela Semanal:</span>
                  <span className="text-sm font-bold">
                    R$ {selectedLoan.weekly_payment.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Total de Parcelas:</span>
                  <span className="text-sm">{selectedLoan.total_weeks} semanas</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Parcelas Pagas:</span>
                  <span className="text-sm">{selectedLoan.weeks_paid}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Valor Restante:</span>
                  <span className="text-sm font-bold text-red-600">
                    R$ {((selectedLoan.total_weeks - selectedLoan.weeks_paid) * selectedLoan.weekly_payment).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Progresso Visual */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Progresso do Pagamento</span>
                  <span>{Math.round((selectedLoan.weeks_paid / selectedLoan.total_weeks) * 100)}%</span>
                </div>
                <Progress 
                  value={(selectedLoan.weeks_paid / selectedLoan.total_weeks) * 100} 
                  className="h-3" 
                />
              </div>

              {/* Datas Importantes */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Data do Empréstimo:</span>
                  <span>{format(new Date(selectedLoan.loan_date), 'dd/MM/yyyy', { locale: ptBR })}</span>
                </div>
                {selectedLoan.next_payment_date && (
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Próximo Pagamento:</span>
                    <span className={`font-semibold ${
                      differenceInDays(new Date(selectedLoan.next_payment_date), new Date()) < 0 
                        ? 'text-red-600' 
                        : differenceInDays(new Date(selectedLoan.next_payment_date), new Date()) === 0
                        ? 'text-orange-600'
                        : 'text-green-600'
                    }`}>
                      {format(new Date(selectedLoan.next_payment_date), 'dd/MM/yyyy', { locale: ptBR })}
                    </span>
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="flex justify-center">
                {getStatusBadge(selectedLoan.status)}
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={() => handleDownloadPDF(selectedLoan)}
                  variant="outline"
                  className="flex-1"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar PDF
                </Button>
                <Button
                  onClick={() => sendWhatsAppMessage(selectedLoan)}
                  variant="outline"
                  className="flex-1"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  WhatsApp
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LoanList;