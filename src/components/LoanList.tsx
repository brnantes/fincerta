import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
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

  const fetchLoans = async () => {
    if (!user) return;

    try {
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
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLoans(data || []);
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
    fetchLoans();
  }, [user, refreshTrigger]);

  const markPayment = async (loanId: string, loan: Loan) => {
    if (!user) return;

    try {
      const newWeeksPaid = loan.weeks_paid + 1;
      const isCompleted = newWeeksPaid >= loan.total_weeks;
      
      // Registrar pagamento
      const { error: paymentError } = await supabase
        .from("loan_payments")
        .insert({
          loan_id: loanId,
          user_id: user.id,
          payment_amount: loan.weekly_payment,
          payment_date: new Date().toISOString().split('T')[0],
          week_number: newWeeksPaid,
        });

      if (paymentError) throw paymentError;

      // Atualizar empréstimo
      const nextPaymentDate = isCompleted 
        ? null 
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { error: loanError } = await supabase
        .from("loans")
        .update({
          weeks_paid: newWeeksPaid,
          status: isCompleted ? "completed" : "active",
          next_payment_date: nextPaymentDate,
        })
        .eq("id", loanId);

      if (loanError) throw loanError;

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

  // Registrar pagamento com comprovante
  const registerPaymentWithReceipt = async () => {
    if (!selectedLoan || !selectedFile) return;

    setUploadingReceipt(true);

    try {
      // Upload do arquivo
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user.id}/${selectedLoan.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(`receipts/${fileName}`, selectedFile);

      if (uploadError) throw uploadError;

      // Registrar pagamento
      const newWeeksPaid = selectedLoan.weeks_paid + 1;
      const isCompleted = newWeeksPaid >= selectedLoan.total_weeks;
      
      const { error: paymentError } = await supabase
        .from("loan_payments")
        .insert({
          user_id: user.id,
          loan_id: selectedLoan.id,
          payment_amount: selectedLoan.weekly_payment,
          payment_date: new Date().toISOString().split('T')[0],
          week_number: newWeeksPaid,
          receipt_url: `receipts/${fileName}`
        });

      if (paymentError) throw paymentError;

      // Atualizar empréstimo
      const nextPaymentDate = isCompleted 
        ? null 
        : addWeeks(new Date(selectedLoan.next_payment_date), 1).toISOString().split('T')[0];

      const { error: loanError } = await supabase
        .from("loans")
        .update({
          weeks_paid: newWeeksPaid,
          status: isCompleted ? "completed" : "pending",
          next_payment_date: nextPaymentDate
        })
        .eq("id", selectedLoan.id);

      if (loanError) throw loanError;

      toast({
        title: "Pagamento registrado!",
        description: isCompleted 
          ? "Empréstimo quitado com comprovante anexado!" 
          : "Pagamento registrado com comprovante anexado.",
      });

      // Limpar estados
      setSelectedFile(null);
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
      
      const { error: paymentError } = await supabase
        .from("loan_payments")
        .insert({
          user_id: user.id,
          loan_id: selectedLoan.id,
          payment_amount: selectedLoan.weekly_payment,
          payment_date: new Date().toISOString().split('T')[0],
          week_number: newWeeksPaid
        });

      if (paymentError) throw paymentError;

      const nextPaymentDate = isCompleted 
        ? null 
        : addWeeks(new Date(selectedLoan.next_payment_date), 1).toISOString().split('T')[0];

      const { error: loanError } = await supabase
        .from("loans")
        .update({
          weeks_paid: newWeeksPaid,
          status: isCompleted ? "completed" : "pending",
          next_payment_date: nextPaymentDate
        })
        .eq("id", selectedLoan.id);

      if (loanError) throw loanError;

      toast({
        title: "Pagamento registrado!",
        description: isCompleted 
          ? "Empréstimo quitado com sucesso!" 
          : "Pagamento registrado com sucesso.",
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
      
      const { error: paymentError } = await supabase
        .from("loan_payments")
        .insert({
          user_id: user.id,
          loan_id: loan.id,
          payment_amount: loan.weekly_payment,
          payment_date: new Date().toISOString().split('T')[0],
          week_number: newWeeksPaid
        });

      if (paymentError) throw paymentError;

      const nextPaymentDate = isCompleted 
        ? null 
        : addWeeks(new Date(loan.next_payment_date), 1).toISOString().split('T')[0];

      const { error: loanError } = await supabase
        .from("loans")
        .update({
          weeks_paid: newWeeksPaid,
          status: isCompleted ? "completed" : "pending",
          next_payment_date: nextPaymentDate
        })
        .eq("id", loan.id);

      if (loanError) throw loanError;

      toast({
        title: "Pagamento registrado!",
        description: isCompleted 
          ? "Empréstimo quitado com sucesso!" 
          : "Pagamento registrado com sucesso.",
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
      
      // RESUMO DA PROPOSTA - DESTAQUE
      doc.setFillColor(30, 58, 138);
      doc.rect(15, yPos - 8, pageWidth - 30, 35, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMO DA PROPOSTA', pageWidth / 2, yPos + 5, { align: 'center' });
      
      // Valores principais em destaque
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      
      const jurosResumo = loan.total_amount - loan.loan_amount;
      const taxaJurosResumo = ((jurosResumo / loan.loan_amount) * 100).toFixed(1);
      
      doc.text(`Valor Emprestado: R$ ${loan.loan_amount.toFixed(2)}`, 25, yPos + 15);
      doc.text(`Total a Pagar: R$ ${loan.total_amount.toFixed(2)}`, 25, yPos + 22);
      doc.text(`${loan.total_weeks} parcelas de R$ ${loan.weekly_payment.toFixed(2)}`, pageWidth - 25, yPos + 15, { align: 'right' });
      doc.text(`Juros: ${taxaJurosResumo}% (R$ ${jurosResumo.toFixed(2)})`, pageWidth - 25, yPos + 22, { align: 'right' });
      
      yPos += 45;
      
      // SEÇÃO DADOS PESSOAIS
      doc.setFillColor(248, 250, 252);
      doc.rect(15, yPos - 8, pageWidth - 30, 12, 'F');
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 58, 138);
      doc.text('DADOS PESSOAIS DO CLIENTE', 20, yPos);
      
      yPos += 18;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      
      // Layout em duas colunas
      const col1 = 20;
      const col2 = pageWidth / 2 + 10;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Nome Completo:', col1, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(loan.clients.full_name, col1 + 35, yPos);
      
      doc.setFont('helvetica', 'bold');
      doc.text('CPF:', col2, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(loan.clients.cpf, col2 + 15, yPos);
      
      yPos += 10;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Telefone:', col1, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(loan.clients.phone || 'Nao informado', col1 + 25, yPos);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Limite de Credito:', col2, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(`R$ ${loan.clients.credit_limit?.toFixed(2) || '0,00'}`, col2 + 40, yPos);
      
      yPos += 10;
      
      if (loan.clients.address && typeof loan.clients.address === 'string') {
        doc.setFont('helvetica', 'bold');
        doc.text('Endereco:', col1, yPos);
        doc.setFont('helvetica', 'normal');
        // Quebrar texto longo em múltiplas linhas se necessário
        const endereco = loan.clients.address.substring(0, 60); // Limitar tamanho
        doc.text(endereco, col1 + 25, yPos);
        yPos += 10;
      }
      
      // Espaço adicional se houver endereço
      if (loan.clients.address) {
        yPos += 5;
      }
      
      yPos += 15;
      
      // SEÇÃO DETALHES FINANCEIROS
      doc.setFillColor(248, 250, 252);
      doc.rect(15, yPos - 8, pageWidth - 30, 12, 'F');
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 58, 138);
      doc.text('DETALHES DO EMPRESTIMO', 20, yPos);
      
      yPos += 18;
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      
      // Valores principais em destaque
      doc.setFont('helvetica', 'bold');
      doc.text('Valor Solicitado:', col1, yPos);
      doc.setTextColor(22, 163, 74); // Verde
      doc.setFontSize(14);
      doc.text(`R$ ${loan.loan_amount.toFixed(2)}`, col1 + 45, yPos);
      
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.text('Valor Total a Pagar:', col2, yPos);
      doc.setTextColor(220, 38, 127); // Rosa/Vermelho
      doc.setFontSize(14);
      doc.text(`R$ ${loan.total_amount.toFixed(2)}`, col2 + 50, yPos);
      
      yPos += 15;
      
      // Detalhes do financiamento
      const juros = loan.total_amount - loan.loan_amount;
      const taxaJuros = ((juros / loan.loan_amount) * 100).toFixed(1);
      
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      
      doc.text(`Juros Total: R$ ${juros.toFixed(2)} (${taxaJuros}%)`, col1, yPos);
      doc.text(`Numero de Parcelas: ${loan.total_weeks} semanas`, col2, yPos);
      
      yPos += 10;
      
      doc.setFont('helvetica', 'bold');
      doc.text('Valor da Parcela Semanal:', col1, yPos);
      doc.setTextColor(59, 130, 246); // Azul
      doc.setFontSize(13);
      doc.text(`R$ ${loan.weekly_payment.toFixed(2)}`, col1 + 60, yPos);
      
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`Data do Emprestimo: ${format(new Date(loan.loan_date), 'dd/MM/yyyy')}`, col2, yPos);
      
      yPos += 10;
      
      if (loan.next_payment_date) {
        doc.text(`Primeira Parcela: ${format(new Date(loan.next_payment_date), 'dd/MM/yyyy')}`, col1, yPos);
      }
      
      yPos += 25;
      
      // CRONOGRAMA MODERNO
      doc.setFillColor(248, 250, 252);
      doc.rect(15, yPos - 8, pageWidth - 30, 12, 'F');
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 58, 138);
      doc.text('CRONOGRAMA DE PAGAMENTOS', 20, yPos);
      
      yPos += 18;
      
      // Cabeçalho da tabela moderno
      doc.setFillColor(30, 58, 138);
      doc.rect(20, yPos - 6, pageWidth - 40, 12, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Parcela', 25, yPos);
      doc.text('Data Vencimento', 70, yPos);
      doc.text('Valor (R$)', 130, yPos);
      doc.text('Status', 165, yPos);
      
      yPos += 15;
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      
      // Cronograma compacto e organizado
      const alturaLinha = 8; // Altura menor para mais parcelas
      const maxParcelasPorPagina = Math.floor((pageHeight - yPos - 60) / alturaLinha);
      let parcelasProcessadas = 0;
      
      for (let i = 0; i < loan.total_weeks; i++) {
        const isPaid = i < loan.weeks_paid;
        const parcela = i + 1;
        
        if (loan.next_payment_date) {
          // Verificar se precisa de nova página (deixar espaço para rodapé)
          if (parcelasProcessadas > 0 && parcelasProcessadas % maxParcelasPorPagina === 0) {
            doc.addPage();
            yPos = 30;
            
            // Cabeçalho da nova página
            doc.setFillColor(30, 58, 138);
            doc.rect(20, yPos - 6, pageWidth - 40, 12, 'F');
            
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Parcela', 25, yPos);
            doc.text('Vencimento', 70, yPos);
            doc.text('Valor', 130, yPos);
            doc.text('Status', 165, yPos);
            
            yPos += 12;
          }
          
          const dataVencimento = addWeeks(new Date(loan.next_payment_date), i - loan.weeks_paid);
          
          // Fundo alternado para melhor leitura
          if (i % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(20, yPos - 3, pageWidth - 40, alturaLinha, 'F');
          }
          
          // Dados da parcela
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          
          doc.text(`${parcela}ª`, 25, yPos);
          doc.text(format(dataVencimento, 'dd/MM/yyyy'), 70, yPos);
          doc.text(`R$ ${loan.weekly_payment.toFixed(2)}`, 130, yPos);
          
          // Status com cores
          if (isPaid) {
            doc.setTextColor(22, 163, 74);
            doc.setFont('helvetica', 'bold');
            doc.text('PAGO', 165, yPos);
          } else {
            doc.setTextColor(239, 68, 68);
            doc.setFont('helvetica', 'normal');
            doc.text('PENDENTE', 165, yPos);
          }
          
          yPos += alturaLinha;
          parcelasProcessadas++;
        }
      }
      
      // RODAPÉ MODERNO
      yPos = pageHeight - 30;
      doc.setFillColor(248, 250, 252);
      doc.rect(0, yPos - 5, pageWidth, 35, 'F');
      
      doc.setTextColor(107, 114, 128);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Este documento foi gerado automaticamente pelo sistema FinCerta', pageWidth / 2, yPos + 5, { align: 'center' });
      doc.text(`Gerado em ${dataAtual} as ${new Date().toLocaleTimeString('pt-BR')}`, pageWidth / 2, yPos + 15, { align: 'center' });
      
      // Nome do arquivo
      const nomeSimples = loan.clients.full_name
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .replace(/\s+/g, '_')
        .toLowerCase();
      
      const nomeArquivo = `proposta_${nomeSimples}_${dataAtual.replace(/\//g, '-')}.pdf`;
      
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