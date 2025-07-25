import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format, addWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { jsPDF } from "jspdf";
import { ArrowLeft, Download, Send } from "lucide-react";

interface Client {
  id: string;
  full_name: string;
  cpf: string;
  credit_limit: number;
  available_credit: number;
  is_first_loan: boolean;
}

interface LoanSimulatorProps {
  onLoanCreated: () => void;
  onBack?: () => void;
}

const LoanSimulator = ({ onLoanCreated, onBack }: LoanSimulatorProps) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [loanAmount, setLoanAmount] = useState<number>(500);
  const [totalWeeks, setTotalWeeks] = useState<number>(4);
  const [totalAmount, setTotalAmount] = useState<number>(675); // Valor padrão com juros
  const [firstPaymentDate, setFirstPaymentDate] = useState(() => {
    // Definir primeira parcela para próxima semana por padrão
    const nextWeek = addWeeks(new Date(), 1);
    return format(nextWeek, 'yyyy-MM-dd');
  });
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdLoan, setCreatedLoan] = useState<any>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const selectedClient = clients.find(c => c.id === selectedClientId);

  // Buscar clientes
  useEffect(() => {
    const fetchClients = async () => {
      if (!user) return;
      
      try {
        setLoadingClients(true);
        const { data, error } = await supabase
          .from("clients")
          .select("*")
          .eq("user_id", user.id)
          .order("full_name");
        
        if (error) throw error;
        setClients(data || []);
      } catch (error: any) {
        toast({
          title: "Erro ao carregar clientes",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoadingClients(false);
      }
    };
    
    fetchClients();
  }, [user]);

  // Criar empréstimo
  const handleLoanCreation = async () => {
    if (!user || !selectedClient || !loanDetails) return;

    // Verificar se o valor não excede o crédito disponível
    if (loanDetails.loanAmount > selectedClient.available_credit) {
      toast({
        title: "Erro",
        description: `Valor solicitado (R$ ${loanDetails.loanAmount.toFixed(2)}) excede o crédito disponível (R$ ${selectedClient.available_credit.toFixed(2)})`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const loanDate = new Date().toISOString().split('T')[0];
      // Criar data corretamente para evitar problemas de timezone
      const [year, month, day] = firstPaymentDate.split('-').map(Number);
      const firstPayment = new Date(year, month - 1, day); // month - 1 porque Date usa 0-11 para meses
      const dueDate = addWeeks(firstPayment, totalWeeks - 1); // -1 porque a primeira parcela já conta

      // Criar empréstimo
      const { error: loanError } = await supabase
        .from("loans")
        .insert({
          user_id: user.id,
          client_id: selectedClientId,
          description: `Empréstimo de R$ ${loanDetails.loanAmount.toFixed(2)}`,
          loan_amount: loanDetails.loanAmount,
          interest_rate: loanDetails.interestRate,
          total_amount: loanDetails.totalAmount,
          weekly_payment: loanDetails.weeklyPayment,
          total_weeks: loanDetails.weeks,
          weeks_paid: 0,
          loan_date: loanDate,
          due_date: dueDate.toISOString().split('T')[0],
          next_payment_date: firstPaymentDate, // Usar a data da primeira parcela
          status: "pending"
        });

      if (loanError) throw loanError;

      // Atualizar crédito do cliente
      const newAvailableCredit = selectedClient.available_credit - loanDetails.loanAmount;
      const { error: creditError } = await supabase
        .from("clients")
        .update({ 
          available_credit: newAvailableCredit,
          is_first_loan: false // Marcar que não é mais primeiro empréstimo
        })
        .eq("id", selectedClientId);

      if (creditError) throw creditError;

      toast({
        title: "Empréstimo aprovado!",
        description: `Empréstimo de R$ ${loanDetails.loanAmount.toFixed(2)} aprovado com sucesso.`,
      });

      // Resetar formulário
      setSelectedClientId("");
      setLoanAmount(500);
      setTotalAmount(675);
      setTotalWeeks(4);
      setFirstPaymentDate(() => {
        const nextWeek = addWeeks(new Date(), 1);
        return format(nextWeek, 'yyyy-MM-dd');
      });
      
      onLoanCreated();
    } catch (error: any) {
      toast({
        title: "Erro ao criar empréstimo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Calcular detalhes do empréstimo
  const calculateLoanDetails = () => {
    if (!selectedClient) return null;

    // Cálculo reverso: a partir do valor total, calcular juros e taxa
    const amount = loanAmount;
    const total = totalAmount;
    const jurosValor = total - amount;
    const interestRate = amount > 0 ? (jurosValor / amount) * 100 : 0;
    const weeklyPayment = total / totalWeeks;
    
    // Calcular datas baseadas na primeira parcela escolhida
    const today = new Date();
    // Criar data corretamente para evitar problemas de timezone
    const [year, month, day] = firstPaymentDate.split('-').map(Number);
    const firstPayment = new Date(year, month - 1, day); // month - 1 porque Date usa 0-11 para meses
    const dueDate = addWeeks(firstPayment, totalWeeks - 1); // -1 porque a primeira parcela já conta
    
    return {
      loanAmount: amount,
      interestRate,
      totalAmount: total,
      jurosValor,
      weeklyPayment,
      weeks: totalWeeks,
      loanDate: format(today, "dd/MM/yyyy", { locale: ptBR }),
      nextPaymentDate: format(firstPayment, "dd/MM/yyyy", { locale: ptBR }),
      dueDate: format(dueDate, "dd/MM/yyyy", { locale: ptBR }),
      paymentSchedule: Array.from({ length: totalWeeks }, (_, i) => {
        // Calcular cada data de pagamento corretamente
        const paymentDate = new Date(firstPayment);
        paymentDate.setDate(paymentDate.getDate() + (i * 7));
        return {
          week: i + 1,
          date: format(paymentDate, "dd/MM/yyyy", { locale: ptBR }),
          amount: weeklyPayment
        };
      })
    };
  };

  const loanDetails = calculateLoanDetails();

  // Lidar com mudança no valor do empréstimo
  const handleAmountChange = (value: number) => {
    if (!selectedClient) return;
    
    // Permitir qualquer valor até o limite disponível do cliente
    const newAmount = Math.min(value, selectedClient.available_credit);
    setLoanAmount(newAmount);
    
    // Ajustar valor total proporcionalmente se necessário
    if (newAmount > 0 && loanAmount > 0) {
      const ratio = newAmount / loanAmount;
      const currentJuros = totalAmount - loanAmount;
      const newJuros = currentJuros * ratio;
      setTotalAmount(newAmount + newJuros);
    }
  };

  // Lidar com mudança no valor total
  const handleTotalAmountChange = (value: number) => {
    if (!selectedClient) return;
    
    // Garantir que o valor total seja maior que o valor emprestado
    const minTotal = loanAmount + 50; // Mínimo R$ 50 de juros
    setTotalAmount(Math.max(value, minTotal));
  };

  // Atualizar valor sugerido quando cliente é selecionado
  useEffect(() => {
    if (selectedClient && selectedClient.is_first_loan) {
      // Para primeira compra, sugerir R$ 500 ou o limite disponível (o que for menor)
      const suggestedAmount = Math.min(500, selectedClient.available_credit);
      setLoanAmount(suggestedAmount);
      // Sugerir valor total com juros (35% como padrão)
      setTotalAmount(suggestedAmount + (suggestedAmount * 0.35));
    }
  }, [selectedClient]);

  // Criar empréstimo
  const handleCreateLoan = async () => {
    if (!user || !selectedClient || !loanDetails) return;

    setLoading(true);

    try {
      const loanDate = new Date().toISOString().split('T')[0];
      const nextPaymentDate = firstPaymentDate; // Usar a primeira parcela escolhida
      const dueDate = addWeeks(new Date(firstPaymentDate), totalWeeks - 1).toISOString().split('T')[0];

      // Criar empréstimo
      const { data: loanData, error: loanError } = await supabase
        .from("loans")
        .insert({
          user_id: user.id,
          client_id: selectedClientId,
          description: `Empréstimo de R$ ${loanDetails.loanAmount.toFixed(2)}`,
          loan_amount: loanDetails.loanAmount,
          interest_rate: loanDetails.interestRate,
          total_amount: loanDetails.totalAmount,
          weekly_payment: loanDetails.weeklyPayment,
          total_weeks: loanDetails.weeks,
          weeks_paid: 0,
          loan_date: loanDate,
          due_date: dueDate,
          next_payment_date: nextPaymentDate,
          status: "pending"
        })
        .select();

      if (loanError) throw loanError;

      // Atualizar crédito do cliente
      const newAvailableCredit = selectedClient.available_credit - loanDetails.loanAmount;
      
      const { error: clientError } = await supabase
        .from("clients")
        .update({
          available_credit: newAvailableCredit,
          is_first_loan: false
        })
        .eq("id", selectedClientId);

      if (clientError) throw clientError;

      // Salvar dados do empréstimo criado para o PDF
      setCreatedLoan({
        ...loanDetails,
        client: selectedClient,
        loanId: loanData?.[0]?.id || 'N/A'
      });
      
      setShowSuccess(true);
      
      toast({
        title: "Empréstimo criado!",
        description: `Empréstimo de R$ ${loanDetails.loanAmount.toFixed(2)} aprovado para ${selectedClient.full_name}`,
      });
    } catch (error: any) {
      toast({
        title: "Erro ao criar empréstimo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Gerar PDF da proposta (simplificado)
  const generateLoanPDF = () => {
    if (!createdLoan) return null;

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const margin = 20;
      let yPosition = 40;

    // Cabeçalho
    doc.setFontSize(22);
    doc.setFont(undefined, 'bold');
    doc.text('PROPOSTA DE EMPRÉSTIMO', pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 30;
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, margin, yPosition);
    
    yPosition += 30;
    
    // Dados do Cliente
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('DADOS DO CLIENTE', margin, yPosition);
    yPosition += 15;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Nome: ${createdLoan.client.full_name}`, margin, yPosition);
    yPosition += 10;
    doc.text(`CPF: ${createdLoan.client.cpf}`, margin, yPosition);
    yPosition += 10;
    doc.text(`Telefone: ${createdLoan.client.phone}`, margin, yPosition);
    
    yPosition += 30;
    
    // Dados do Empréstimo
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('CONDIÇÕES DO EMPRÉSTIMO', margin, yPosition);
    yPosition += 15;
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'normal');
    doc.text(`Valor a Receber: R$ ${createdLoan.loanAmount.toFixed(2)}`, margin, yPosition);
    yPosition += 12;
    doc.text(`Valor Total a Pagar: R$ ${createdLoan.totalAmount.toFixed(2)}`, margin, yPosition);
    yPosition += 12;
    doc.text(`Parcelas: ${createdLoan.weeks}x de R$ ${createdLoan.weeklyPayment.toFixed(2)} (semanais)`, margin, yPosition);
    yPosition += 12;
    doc.text(`Juros: R$ ${createdLoan.jurosValor.toFixed(2)} (${createdLoan.interestRate.toFixed(1)}%)`, margin, yPosition);
    
    yPosition += 30;
    
    // Cronograma simplificado
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('CRONOGRAMA DE PAGAMENTOS', margin, yPosition);
    yPosition += 15;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(`Início: ${createdLoan.loanDate}`, margin, yPosition);
    yPosition += 8;
    doc.text(`Vencimento: ${createdLoan.dueDate}`, margin, yPosition);
    yPosition += 8;
    doc.text(`Pagamento: Toda semana, R$ ${createdLoan.weeklyPayment.toFixed(2)}`, margin, yPosition);
    
    yPosition += 40;
    
    // Assinatura
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text('_'.repeat(50), margin, yPosition);
    yPosition += 8;
    doc.text('Assinatura do Cliente', margin, yPosition);
    
    doc.text('_'.repeat(50), pageWidth - margin - 120, yPosition - 8);
    doc.text('Sistema de Cobrança', pageWidth - margin - 120, yPosition);
    
    return doc;
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      return null;
    }
  };

  // Baixar PDF
  const handleDownloadPDF = () => {
    try {
      const doc = generateLoanPDF();
      if (!doc || !createdLoan) {
        toast({
          title: "Erro ao gerar PDF",
          description: "Não foi possível gerar o PDF da proposta.",
          variant: "destructive",
        });
        return;
      }

      // Gerar nome do arquivo limpo e padronizado
      const clientName = createdLoan.client.full_name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove caracteres especiais
        .replace(/\s+/g, '_') // Substitui espaços por underscore
        .toLowerCase(); // Converte para minúsculo
      
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
      
      const fileName = `proposta_emprestimo_${clientName}_${dateStr}.pdf`;
      
      doc.save(fileName);
      
      toast({
        title: "PDF baixado!",
        description: `Arquivo baixado: ${fileName}`,
      });
    } catch (error) {
      console.error('Erro ao baixar PDF:', error);
      toast({
        title: "Erro ao baixar PDF",
        description: "Ocorreu um erro ao tentar baixar o arquivo PDF.",
        variant: "destructive",
      });
    }
  };

  // Simular envio por WhatsApp (você pode integrar com uma API real)
  const handleSendProposal = () => {
    if (!createdLoan) return;
    
    const message = `Olá ${createdLoan.client.full_name}! Sua proposta de empréstimo foi aprovada:\n\n` +
      `💰 Valor a receber: R$ ${createdLoan.loanAmount.toFixed(2)}\n` +
      `💳 Valor total a pagar: R$ ${createdLoan.totalAmount.toFixed(2)}\n` +
      `📅 Parcelas: ${createdLoan.weeks}x de R$ ${createdLoan.weeklyPayment.toFixed(2)} (semanais)\n` +
      `📊 Juros: R$ ${createdLoan.jurosValor.toFixed(2)}\n\n` +
      `Entre em contato para finalizar o processo!`;
    
    const phoneNumber = createdLoan.client.phone.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/55${phoneNumber}?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
    
    toast({
      title: "Proposta enviada!",
      description: "WhatsApp aberto para envio da proposta.",
    });
  };

  // Resetar e voltar
  const handleReset = () => {
    setSelectedClientId("");
    setLoanAmount(500);
    setTotalWeeks(4);
    setTotalAmount(675);
    setShowSuccess(false);
    setCreatedLoan(null);
    if (onBack) {
      onBack();
    } else {
      onLoanCreated();
    }
  };

  // Tela de sucesso após aprovação
  if (showSuccess && createdLoan) {
    return (
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            {onBack && (
              <Button variant="ghost" size="sm" onClick={handleReset}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <div>
              <CardTitle className="text-green-600">✅ Empréstimo Aprovado!</CardTitle>
              <CardDescription>
                Proposta gerada com sucesso para {createdLoan.client.full_name}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-semibold text-green-800 mb-2">Resumo do Empréstimo</h3>
              <div className="grid grid-cols-2 gap-2 text-sm text-green-700">
                <p><strong>Valor solicitado:</strong> R$ {createdLoan.loanAmount.toFixed(2)}</p>
                <p><strong>Juros:</strong> R$ {createdLoan.jurosValor.toFixed(2)} ({createdLoan.interestRate.toFixed(1)}%)</p>
                <p><strong>Valor total:</strong> R$ {createdLoan.totalAmount.toFixed(2)}</p>
                <p><strong>Parcela:</strong> R$ {createdLoan.weeklyPayment.toFixed(2)}</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleDownloadPDF} className="flex-1">
                <Download className="w-4 h-4 mr-2" />
                Baixar PDF
              </Button>
              <Button onClick={handleSendProposal} variant="outline" className="flex-1">
                <Send className="w-4 h-4 mr-2" />
                Enviar Proposta
              </Button>
            </div>
            
            <Button onClick={handleReset} variant="outline" className="w-full">
              Nova Simulação
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <div>
            <CardTitle>Simulação de Empréstimo</CardTitle>
            <CardDescription>
              Configure valor, juros e prazo - Pagamento semanal
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Seleção de Cliente */}
          <div className="space-y-2">
            <Label htmlFor="client">Selecione o Cliente</Label>
            <Select value={selectedClientId} onValueChange={setSelectedClientId} disabled={loadingClients}>
              <SelectTrigger>
                <SelectValue placeholder={loadingClients ? "Carregando clientes..." : "Selecione um cliente"} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.full_name} - CPF: {client.cpf}
                    {client.is_first_loan && " ⭐"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedClient && (
            <>
              {/* Informações do Cliente */}
              <Card className="bg-muted/50 border-none">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold">{selectedClient.full_name}</h3>
                    {selectedClient.is_first_loan && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                        Primeira Compra
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p><strong>CPF:</strong> {selectedClient.cpf}</p>
                      <p><strong>Limite Total:</strong> R$ {selectedClient.credit_limit.toFixed(2)}</p>
                    </div>
                    <div>
                      <p><strong>Crédito Disponível:</strong> R$ {selectedClient.available_credit.toFixed(2)}</p>
                      {selectedClient.is_first_loan && (
                        <p className="text-amber-800">
                          <strong>Sugestão Primeira Compra:</strong> R$ 500,00
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Valor do Empréstimo */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor="loan-amount">Valor do Empréstimo</Label>
                  <span className="text-sm font-medium">
                    R$ {loanAmount.toFixed(2)}
                  </span>
                </div>
                
                <div className="flex gap-2 items-center">
                  <Slider
                    id="loan-amount"
                    min={100}
                    max={selectedClient.available_credit}
                    step={50}
                    value={[loanAmount]}
                    onValueChange={(values) => handleAmountChange(values[0])}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={100}
                    max={selectedClient.available_credit}
                    step={50}
                    value={loanAmount}
                    onChange={(e) => handleAmountChange(Number(e.target.value))}
                    className="w-24 text-sm"
                  />
                </div>
                
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>R$ 100,00</span>
                  <span>Máx: R$ {selectedClient.available_credit.toFixed(2)}</span>
                </div>
                
                {selectedClient.is_first_loan && loanAmount === 500 && (
                  <p className="text-xs text-amber-600">
                    💡 Valor sugerido para primeira compra
                  </p>
                )}
              </div>

              {/* Valor Total a Pagar */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor="total-amount">Valor Total a Pagar (R$)</Label>
                  <span className="text-sm font-medium">
                    R$ {totalAmount.toFixed(2)}
                  </span>
                </div>
                
                <div className="flex gap-2 items-center">
                  <Slider
                    id="total-amount"
                    min={loanAmount + 50}
                    max={loanAmount * 2}
                    step={25}
                    value={[totalAmount]}
                    onValueChange={(values) => handleTotalAmountChange(values[0])}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={loanAmount + 50}
                    max={loanAmount * 2}
                    step={25}
                    value={totalAmount}
                    onChange={(e) => handleTotalAmountChange(Number(e.target.value))}
                    className="w-24 text-sm"
                  />
                </div>
                
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Mín: R$ {(loanAmount + 50).toFixed(0)}</span>
                  <span>Máx: R$ {(loanAmount * 2).toFixed(0)}</span>
                </div>
                
                {loanDetails && (
                  <p className="text-xs text-blue-600">
                    📊 Juros: R$ {loanDetails.jurosValor.toFixed(2)} ({loanDetails.interestRate.toFixed(1)}%)
                  </p>
                )}
              </div>

              {/* Duração do Empréstimo */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor="loan-weeks">Duração (semanas)</Label>
                  <span className="text-sm font-medium">
                    {totalWeeks} {totalWeeks === 1 ? 'semana' : 'semanas'}
                  </span>
                </div>
                
                <div className="flex gap-2 items-center">
                  <Slider
                    id="loan-weeks"
                    min={1}
                    max={12}
                    step={1}
                    value={[totalWeeks]}
                    onValueChange={(values) => setTotalWeeks(values[0])}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    step={1}
                    value={totalWeeks}
                    onChange={(e) => setTotalWeeks(Number(e.target.value))}
                    className="w-20 text-sm"
                  />
                </div>
                
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1 semana</span>
                  <span>12 semanas</span>
                </div>
              </div>

              {/* Data da Primeira Parcela */}
              <div className="space-y-2">
                <Label htmlFor="first-payment-date">Data da Primeira Parcela</Label>
                <Input
                  id="first-payment-date"
                  type="date"
                  value={firstPaymentDate}
                  onChange={(e) => setFirstPaymentDate(e.target.value)}
                  min={format(new Date(), 'yyyy-MM-dd')} // Não permitir datas passadas
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  As demais parcelas serão calculadas com 7 dias de intervalo
                </p>
              </div>

              {/* Resultado da Simulação */}
              {loanDetails && (
                <Card className="bg-primary/5 border border-primary/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Detalhes do Empréstimo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-sm"><strong>Valor solicitado:</strong> R$ {loanDetails.loanAmount.toFixed(2)}</p>
                        <p className="text-sm"><strong>Juros:</strong> R$ {loanDetails.jurosValor.toFixed(2)} ({loanDetails.interestRate.toFixed(1)}%)</p>
                        <p className="text-sm"><strong>Valor total:</strong> R$ {loanDetails.totalAmount.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-sm"><strong>Parcela semanal:</strong> R$ {loanDetails.weeklyPayment.toFixed(2)}</p>
                        <p className="text-sm"><strong>Data inicial:</strong> {loanDetails.loanDate}</p>
                        <p className="text-sm"><strong>Data final:</strong> {loanDetails.dueDate}</p>
                      </div>
                    </div>

                    <h4 className="font-semibold text-sm mb-2">Cronograma de Pagamentos</h4>
                    <div className="max-h-40 overflow-y-auto border rounded-md">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="p-2 text-left">Semana</th>
                            <th className="p-2 text-left">Data</th>
                            <th className="p-2 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loanDetails.paymentSchedule.map((payment) => (
                            <tr key={payment.week} className="border-t">
                              <td className="p-2">{payment.week}</td>
                              <td className="p-2">{payment.date}</td>
                              <td className="p-2 text-right">R$ {payment.amount.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Botão de Aprovação */}
              <Button 
                onClick={handleLoanCreation} 
                className="w-full" 
                disabled={loading || !loanDetails || loanDetails.loanAmount <= 0 || loanDetails.loanAmount > selectedClient.available_credit || totalAmount <= loanAmount}
              >
                {loading ? "Processando..." : "Aprovar Empréstimo"}
              </Button>
              
              {loanDetails && loanDetails.loanAmount > selectedClient.available_credit && (
                <p className="text-sm text-red-600 text-center mt-2">
                  ⚠️ Valor excede o crédito disponível do cliente
                </p>
              )}
              
              {totalAmount <= loanAmount && (
                <p className="text-sm text-red-600 text-center mt-2">
                  ⚠️ Valor total deve ser maior que o valor emprestado
                </p>
              )}
            </>
          )}

          {!selectedClient && !loadingClients && (
            <div className="text-center py-8 text-muted-foreground">
              Selecione um cliente para simular um empréstimo
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default LoanSimulator;
