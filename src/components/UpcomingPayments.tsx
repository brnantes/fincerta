import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format, addWeeks, isAfter, isBefore, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Clock, 
  AlertTriangle, 
  DollarSign, 
  MessageSquare, 
  Upload, 
  FileText, 
  Camera,
  Receipt,
  Send
} from "lucide-react";
import { jsPDF } from "jspdf";

interface UpcomingPayment {
  id: string;
  client_name: string;
  client_phone: string;
  client_cpf: string;
  loan_amount: number;
  weekly_payment: number;
  next_payment_date: string;
  weeks_paid: number;
  total_weeks: number;
  status: string;
  daysUntilDue: number;
}

const UpcomingPayments = () => {
  const [upcomingPayments, setUpcomingPayments] = useState<UpcomingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState<UpcomingPayment | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchUpcomingPayments();
  }, [user]);

  const fetchUpcomingPayments = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("loans")
        .select(`
          id,
          loan_amount,
          weekly_payment,
          next_payment_date,
          weeks_paid,
          total_weeks,
          status,
          clients!inner(
            full_name,
            phone,
            cpf
          )
        `)
        .eq("user_id", user.id)
        .in("status", ["pending", "active"])
        .not("next_payment_date", "is", null)
        .order("next_payment_date", { ascending: true });

      if (error) throw error;

      const today = new Date();
      const paymentsWithDays = data?.map(loan => ({
        id: loan.id,
        client_name: loan.clients.full_name,
        client_phone: loan.clients.phone,
        client_cpf: loan.clients.cpf,
        loan_amount: loan.loan_amount,
        weekly_payment: loan.weekly_payment,
        next_payment_date: loan.next_payment_date,
        weeks_paid: loan.weeks_paid,
        total_weeks: loan.total_weeks,
        status: loan.status,
        daysUntilDue: differenceInDays(new Date(loan.next_payment_date), today)
      })) || [];

      // Filtrar apenas pagamentos dos próximos 7 dias ou em atraso
      const filtered = paymentsWithDays.filter(payment => payment.daysUntilDue <= 7);
      
      setUpcomingPayments(filtered);
    } catch (error: any) {
      toast({
        title: "Erro ao buscar pagamentos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getPaymentStatus = (daysUntilDue: number) => {
    if (daysUntilDue < 0) return "overdue";
    if (daysUntilDue === 0) return "today";
    if (daysUntilDue <= 2) return "urgent";
    return "upcoming";
  };

  const getStatusBadge = (daysUntilDue: number) => {
    const status = getPaymentStatus(daysUntilDue);
    
    switch (status) {
      case "overdue":
        return <Badge variant="destructive">Em Atraso ({Math.abs(daysUntilDue)} dias)</Badge>;
      case "today":
        return <Badge className="bg-orange-100 text-orange-800">Vence Hoje</Badge>;
      case "urgent":
        return <Badge className="bg-yellow-100 text-yellow-800">Vence em {daysUntilDue} dias</Badge>;
      case "upcoming":
        return <Badge variant="secondary">Vence em {daysUntilDue} dias</Badge>;
      default:
        return <Badge variant="outline">Pendente</Badge>;
    }
  };

  const getStatusIcon = (daysUntilDue: number) => {
    const status = getPaymentStatus(daysUntilDue);
    
    switch (status) {
      case "overdue":
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case "today":
        return <Clock className="w-4 h-4 text-orange-600" />;
      case "urgent":
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case "upcoming":
        return <Clock className="w-4 h-4 text-blue-600" />;
      default:
        return <DollarSign className="w-4 h-4 text-gray-600" />;
    }
  };

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

  const registerPaymentWithReceipt = async () => {
    if (!selectedPayment || !selectedFile) return;

    setUploadingReceipt(true);

    try {
      // Upload do arquivo
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user.id}/${selectedPayment.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(`receipts/${fileName}`, selectedFile);

      if (uploadError) throw uploadError;

      // Atualizar empréstimo
      const newWeeksPaid = selectedPayment.weeks_paid + 1;
      const isCompleted = newWeeksPaid >= selectedPayment.total_weeks;
      
      const nextPaymentDate = isCompleted 
        ? null 
        : addWeeks(new Date(selectedPayment.next_payment_date), 1).toISOString().split('T')[0];

      const { error: loanError } = await supabase
        .from("loans")
        .update({
          weeks_paid: newWeeksPaid,
          status: isCompleted ? "completed" : "pending",
          next_payment_date: nextPaymentDate
        })
        .eq("id", selectedPayment.id);

      if (loanError) throw loanError;

      // Registrar pagamento
      const { error: paymentError } = await supabase
        .from("loan_payments")
        .insert({
          user_id: user.id,
          loan_id: selectedPayment.id,
          payment_amount: selectedPayment.weekly_payment,
          payment_date: new Date().toISOString().split('T')[0],
          week_number: newWeeksPaid,
          receipt_url: `receipts/${fileName}`
        });

      if (paymentError) throw paymentError;

      toast({
        title: "Pagamento registrado!",
        description: isCompleted 
          ? "Empréstimo quitado com comprovante anexado!" 
          : "Pagamento registrado com comprovante anexado.",
      });

      // Limpar estados e atualizar lista
      setSelectedFile(null);
      setSelectedPayment(null);
      setPaymentDialogOpen(false);
      fetchUpcomingPayments();
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

  const registerSimplePayment = async () => {
    if (!selectedPayment) return;

    setProcessingPayment(true);

    try {
      const newWeeksPaid = selectedPayment.weeks_paid + 1;
      const isCompleted = newWeeksPaid >= selectedPayment.total_weeks;
      
      const nextPaymentDate = isCompleted 
        ? null 
        : addWeeks(new Date(selectedPayment.next_payment_date), 1).toISOString().split('T')[0];

      const { error: loanError } = await supabase
        .from("loans")
        .update({
          weeks_paid: newWeeksPaid,
          status: isCompleted ? "completed" : "pending",
          next_payment_date: nextPaymentDate
        })
        .eq("id", selectedPayment.id);

      if (loanError) throw loanError;

      const { error: paymentError } = await supabase
        .from("loan_payments")
        .insert({
          user_id: user.id,
          loan_id: selectedPayment.id,
          payment_amount: selectedPayment.weekly_payment,
          payment_date: new Date().toISOString().split('T')[0],
          week_number: newWeeksPaid
        });

      if (paymentError) throw paymentError;

      toast({
        title: "Pagamento registrado!",
        description: isCompleted 
          ? "Empréstimo quitado com sucesso!" 
          : "Pagamento registrado com sucesso.",
      });

      setSelectedPayment(null);
      setPaymentDialogOpen(false);
      fetchUpcomingPayments();
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

  const generatePaymentReceipt = (payment: UpcomingPayment) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const margin = 20;
      let yPosition = 40;

      // Cabeçalho
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("RECIBO DE PAGAMENTO", pageWidth / 2, yPosition, { align: "center" });
      
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
      doc.text(`Nome: ${payment.client_name}`, margin, yPosition);
      yPosition += 10;
      doc.text(`CPF: ${payment.client_cpf}`, margin, yPosition);
      yPosition += 10;
      doc.text(`Telefone: ${payment.client_phone}`, margin, yPosition);
      
      yPosition += 25;

      // Dados do Pagamento
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("DADOS DO PAGAMENTO", margin, yPosition);
      yPosition += 15;
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Parcela: ${payment.weeks_paid + 1} de ${payment.total_weeks}`, margin, yPosition);
      yPosition += 10;
      doc.text(`Valor Pago: R$ ${payment.weekly_payment.toFixed(2)}`, margin, yPosition);
      yPosition += 10;
      doc.text(`Data de Vencimento: ${format(new Date(payment.next_payment_date), 'dd/MM/yyyy', { locale: ptBR })}`, margin, yPosition);
      yPosition += 10;
      doc.text(`Data do Pagamento: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, margin, yPosition);

      // Rodapé
      yPosition = doc.internal.pageSize.height - 40;
      doc.setFontSize(10);
      doc.text('_'.repeat(50), margin, yPosition - 8);
      doc.text('Cliente', margin, yPosition);
      doc.text('_'.repeat(50), pageWidth - margin - 120, yPosition - 8);
      doc.text('Sistema de Cobrança', pageWidth - margin - 120, yPosition);
      
      return doc;
    } catch (error) {
      console.error('Erro ao gerar recibo:', error);
      return null;
    }
  };

  const handleDownloadReceipt = (payment: UpcomingPayment) => {
    try {
      const doc = generatePaymentReceipt(payment);
      if (!doc) {
        toast({
          title: "Erro ao gerar recibo",
          description: "Não foi possível gerar o recibo de pagamento.",
          variant: "destructive",
        });
        return;
      }

      const clientNameClean = payment.client_name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .toLowerCase();
      
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      const fileName = `recibo_pagamento_${clientNameClean}_${dateStr}.pdf`;
      
      doc.save(fileName);
      
      toast({
        title: "Recibo baixado!",
        description: `Recibo baixado: ${fileName}`,
      });
    } catch (error) {
      console.error('Erro ao baixar recibo:', error);
      toast({
        title: "Erro ao baixar recibo",
        description: "Ocorreu um erro ao tentar baixar o recibo.",
        variant: "destructive",
      });
    }
  };

  const sendWhatsAppMessage = (payment: UpcomingPayment) => {
    const isOverdue = payment.daysUntilDue < 0;
    const isToday = payment.daysUntilDue === 0;
    
    let message = `Olá ${payment.client_name}! 👋\n\n`;
    
    if (isOverdue) {
      message += `⚠️ *PAGAMENTO EM ATRASO*\n\n`;
      message += `Sua parcela está em atraso há ${Math.abs(payment.daysUntilDue)} dias.\n\n`;
    } else if (isToday) {
      message += `⏰ *LEMBRETE DE PAGAMENTO*\n\n`;
      message += `Sua parcela vence hoje!\n\n`;
    } else {
      message += `📅 *LEMBRETE DE PAGAMENTO*\n\n`;
      message += `Sua parcela vence em ${payment.daysUntilDue} dias.\n\n`;
    }
    
    message += `💰 *Detalhes do Pagamento:*\n`;
    message += `• Parcela: ${payment.weeks_paid + 1} de ${payment.total_weeks}\n`;
    message += `• Valor: R$ ${payment.weekly_payment.toFixed(2)}\n`;
    message += `• Vencimento: ${format(new Date(payment.next_payment_date), 'dd/MM/yyyy', { locale: ptBR })}\n\n`;
    
    if (isOverdue) {
      message += `Por favor, regularize seu pagamento o quanto antes. 🙏`;
    } else {
      message += `Obrigado pela sua pontualidade! 😊`;
    }
    
    const phoneNumber = payment.client_phone.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/55${phoneNumber}?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
    
    toast({
      title: "WhatsApp aberto!",
      description: "Mensagem preparada para envio.",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">Carregando pagamentos...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pagamentos Próximos do Vencimento</CardTitle>
      </CardHeader>
      <CardContent>
        {upcomingPayments.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Nenhum pagamento próximo do vencimento.
          </p>
        ) : (
          <div className="space-y-4">
            {upcomingPayments.map((payment) => (
              <div key={payment.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold">{payment.client_name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Parcela {payment.weeks_paid + 1} de {payment.total_weeks}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Vencimento: {format(new Date(payment.next_payment_date), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(payment.daysUntilDue)}
                      {getStatusBadge(payment.daysUntilDue)}
                    </div>
                    <p className="font-semibold text-lg">R$ {payment.weekly_payment.toFixed(2)}</p>
                  </div>
                </div>
                
                <div className="flex gap-2 flex-wrap">
                  <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        onClick={() => setSelectedPayment(payment)}
                        size="sm"
                        variant="default"
                      >
                        <DollarSign className="w-4 h-4 mr-1" />
                        Dar Baixa
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Registrar Pagamento</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="p-3 bg-blue-50 rounded-md">
                          <p className="font-semibold">{selectedPayment?.client_name}</p>
                          <p className="text-sm text-muted-foreground">
                            Parcela {selectedPayment?.weeks_paid + 1} de {selectedPayment?.total_weeks}
                          </p>
                          <p className="text-lg font-bold text-green-600">
                            R$ {selectedPayment?.weekly_payment.toFixed(2)}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            onClick={registerSimplePayment}
                            disabled={processingPayment}
                          >
                            {processingPayment ? "Processando..." : "Pagamento Simples"}
                          </Button>
                          
                          <Button
                            onClick={() => {
                              // Mostrar seção de upload
                              document.getElementById('receipt-section')?.classList.remove('hidden');
                            }}
                            variant="secondary"
                          >
                            <Camera className="w-4 h-4 mr-1" />
                            Com Comprovante
                          </Button>
                        </div>

                        <div id="receipt-section" className="hidden space-y-3">
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

                          <Button
                            onClick={registerPaymentWithReceipt}
                            disabled={!selectedFile || uploadingReceipt}
                            className="w-full"
                          >
                            {uploadingReceipt ? (
                              "Enviando..."
                            ) : (
                              <>
                                <Upload className="w-4 h-4 mr-2" />
                                Confirmar com Comprovante
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button
                    onClick={() => handleDownloadReceipt(payment)}
                    size="sm"
                    variant="outline"
                  >
                    <Receipt className="w-4 h-4 mr-1" />
                    Recibo
                  </Button>

                  <Button
                    onClick={() => sendWhatsAppMessage(payment)}
                    size="sm"
                    variant="outline"
                  >
                    <MessageSquare className="w-4 h-4 mr-1" />
                    WhatsApp
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default UpcomingPayments;
