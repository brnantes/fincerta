import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format, addWeeks, isAfter, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle, Clock, AlertCircle, DollarSign, Upload, Download, FileText, Camera } from "lucide-react";
import { jsPDF } from "jspdf";

interface Loan {
  id: string;
  loan_amount: number;
  total_amount: number;
  weekly_payment: number;
  total_weeks: number;
  weeks_paid: number;
  loan_date: string;
  due_date: string;
  next_payment_date: string;
  status: string;
  interest_rate: number;
  description: string;
}

interface LoanPaymentsProps {
  clientId: string;
  clientName: string;
  onBack: () => void;
}

const LoanPayments = ({ clientId, clientName, onBack }: LoanPaymentsProps) => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLoanForPayment, setSelectedLoanForPayment] = useState<string | null>(null);
  const [showPaymentHistory, setShowPaymentHistory] = useState<string | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchLoans();
  }, [clientId]);

  const fetchLoans = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("loans")
        .select("*")
        .eq("client_id", clientId)
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

  const registerPayment = async (loanId: string) => {
    if (!user) return;

    setPaymentLoading(loanId);

    try {
      const loan = loans.find(l => l.id === loanId);
      if (!loan) return;

      const newWeeksPaid = loan.weeks_paid + 1;
      const isCompleted = newWeeksPaid >= loan.total_weeks;
      
      // Calcular próxima data de pagamento
      const nextPaymentDate = isCompleted 
        ? null 
        : addWeeks(new Date(loan.next_payment_date), 1).toISOString().split('T')[0];

      // Atualizar empréstimo
      const { error: loanError } = await supabase
        .from("loans")
        .update({
          weeks_paid: newWeeksPaid,
          status: isCompleted ? "completed" : "pending",
          next_payment_date: nextPaymentDate
        })
        .eq("id", loanId);

      if (loanError) throw loanError;

      // Registrar pagamento
      const { error: paymentError } = await supabase
        .from("loan_payments")
        .insert({
          user_id: user.id,
          loan_id: loanId,
          payment_amount: loan.weekly_payment,
          payment_date: new Date().toISOString().split('T')[0],
          week_number: newWeeksPaid
        });

      if (paymentError) throw paymentError;

      // Se empréstimo foi quitado, restaurar crédito do cliente
      if (isCompleted) {
        // Buscar crédito atual do cliente
        const { data: clientData, error: fetchError } = await supabase
          .from("clients")
          .select("available_credit")
          .eq("id", clientId)
          .single();

        if (fetchError) {
          console.error("Erro ao buscar crédito do cliente:", fetchError);
        } else {
          // Restaurar crédito
          const newCredit = clientData.available_credit + loan.loan_amount;
          const { error: clientError } = await supabase
            .from("clients")
            .update({ available_credit: newCredit })
            .eq("id", clientId);

          if (clientError) {
            console.error("Erro ao restaurar crédito:", clientError);
          }
        }
      }

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
      setPaymentLoading(null);
    }
  };

  const getPaymentStatus = (loan: Loan) => {
    if (loan.status === "completed") return "completed";
    
    const today = new Date();
    const nextPayment = new Date(loan.next_payment_date);
    
    if (isBefore(nextPayment, today)) return "overdue";
    return "pending";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800">Quitado</Badge>;
      case "overdue":
        return <Badge variant="destructive">Em Atraso</Badge>;
      case "pending":
        return <Badge variant="secondary">Pendente</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "overdue":
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-600" />;
      default:
        return <DollarSign className="w-4 h-4 text-gray-600" />;
    }
  };

  // Upload de comprovante de pagamento
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validar tipo de arquivo
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Tipo de arquivo inválido",
          description: "Apenas imagens (JPG, PNG) e PDF são permitidos.",
          variant: "destructive",
        });
        return;
      }

      // Validar tamanho (máximo 5MB)
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
  const handlePaymentWithReceipt = async () => {
    if (!selectedLoanForPayment || !selectedFile) return;

    setUploadingReceipt(selectedLoanForPayment);

    try {
      const loan = loans.find(l => l.id === selectedLoanForPayment);
      if (!loan) return;

      // Upload do arquivo para o Supabase Storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user.id}/${selectedLoanForPayment}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(`receipts/${fileName}`, selectedFile);

      if (uploadError) throw uploadError;

      // Registrar pagamento com referência ao comprovante
      const newWeeksPaid = loan.weeks_paid + 1;
      const isCompleted = newWeeksPaid >= loan.total_weeks;
      
      const nextPaymentDate = isCompleted 
        ? null 
        : addWeeks(new Date(loan.next_payment_date), 1).toISOString().split('T')[0];

      // Atualizar empréstimo
      const { error: loanError } = await supabase
        .from("loans")
        .update({
          weeks_paid: newWeeksPaid,
          status: isCompleted ? "completed" : "pending",
          next_payment_date: nextPaymentDate
        })
        .eq("id", selectedLoanForPayment);

      if (loanError) throw loanError;

      // Registrar pagamento com comprovante
      const { error: paymentError } = await supabase
        .from("loan_payments")
        .insert({
          user_id: user.id,
          loan_id: selectedLoanForPayment,
          payment_amount: loan.weekly_payment,
          payment_date: new Date().toISOString().split('T')[0],
          week_number: newWeeksPaid,
          receipt_url: `receipts/${fileName}`
        });

      if (paymentError) throw paymentError;

      // Se empréstimo foi quitado, restaurar crédito do cliente
      if (isCompleted) {
        const { data: clientData } = await supabase
          .from("clients")
          .select("available_credit")
          .eq("id", clientId)
          .single();

        if (clientData) {
          const newCredit = clientData.available_credit + loan.loan_amount;
          await supabase
            .from("clients")
            .update({ available_credit: newCredit })
            .eq("id", clientId);
        }
      }

      toast({
        title: "Pagamento registrado!",
        description: isCompleted 
          ? "Empréstimo quitado com comprovante anexado!" 
          : "Pagamento registrado com comprovante anexado.",
      });

      // Limpar estados
      setSelectedFile(null);
      setSelectedLoanForPayment(null);
      setDialogOpen(false);
      fetchLoans();
    } catch (error: any) {
      toast({
        title: "Erro ao registrar pagamento",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploadingReceipt(null);
    }
  };

  // Gerar PDF da proposta do empréstimo
  const generateLoanProposalPDF = (loan: Loan) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const margin = 20;
      let yPosition = 40;

      // Cabeçalho
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("PROPOSTA DE EMPRÉSTIMO", pageWidth / 2, yPosition, { align: "center" });
      
      yPosition += 20;
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, pageWidth - margin - 60, yPosition);
      
      yPosition += 30;

      // Dados do Cliente
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("DADOS DO CLIENTE", margin, yPosition);
      yPosition += 15;
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Nome: ${clientName}`, margin, yPosition);
      yPosition += 10;
      
      yPosition += 20;

      // Dados do Empréstimo
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("DADOS DO EMPRÉSTIMO", margin, yPosition);
      yPosition += 15;
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Valor Emprestado: R$ ${loan.loan_amount.toFixed(2)}`, margin, yPosition);
      yPosition += 10;
      doc.text(`Valor Total a Pagar: R$ ${loan.total_amount.toFixed(2)}`, margin, yPosition);
      yPosition += 10;
      doc.text(`Juros: R$ ${(loan.total_amount - loan.loan_amount).toFixed(2)} (${loan.interest_rate.toFixed(1)}%)`, margin, yPosition);
      yPosition += 10;
      doc.text(`Parcelas: ${loan.total_weeks}x de R$ ${loan.weekly_payment.toFixed(2)}`, margin, yPosition);
      yPosition += 10;
      doc.text(`Data do Empréstimo: ${format(new Date(loan.loan_date), 'dd/MM/yyyy', { locale: ptBR })}`, margin, yPosition);
      yPosition += 10;
      doc.text(`Vencimento: ${format(new Date(loan.due_date), 'dd/MM/yyyy', { locale: ptBR })}`, margin, yPosition);
      
      yPosition += 30;

      // Status atual
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("STATUS ATUAL", margin, yPosition);
      yPosition += 15;
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Parcelas Pagas: ${loan.weeks_paid} de ${loan.total_weeks}`, margin, yPosition);
      yPosition += 10;
      doc.text(`Valor Pago: R$ ${(loan.weeks_paid * loan.weekly_payment).toFixed(2)}`, margin, yPosition);
      yPosition += 10;
      doc.text(`Valor Restante: R$ ${((loan.total_weeks - loan.weeks_paid) * loan.weekly_payment).toFixed(2)}`, margin, yPosition);
      yPosition += 10;
      doc.text(`Status: ${loan.status === 'completed' ? 'Quitado' : loan.status === 'pending' ? 'Pendente' : 'Em Atraso'}`, margin, yPosition);
      
      if (loan.status !== 'completed') {
        yPosition += 10;
        doc.text(`Próximo Pagamento: ${format(new Date(loan.next_payment_date), 'dd/MM/yyyy', { locale: ptBR })}`, margin, yPosition);
      }

      // Rodapé
      yPosition = doc.internal.pageSize.height - 40;
      doc.setFontSize(10);
      doc.text('_'.repeat(50), margin, yPosition - 8);
      doc.text('Cliente', margin, yPosition);
      doc.text('_'.repeat(50), pageWidth - margin - 120, yPosition - 8);
      doc.text('Sistema de Cobrança', pageWidth - margin - 120, yPosition);
      
      return doc;
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      return null;
    }
  };

  // Baixar PDF da proposta
  const handleDownloadProposal = (loan: Loan) => {
    try {
      const doc = generateLoanProposalPDF(loan);
      if (!doc) {
        toast({
          title: "Erro ao gerar PDF",
          description: "Não foi possível gerar o PDF da proposta.",
          variant: "destructive",
        });
        return;
      }

      // Nome do arquivo
      const clientNameClean = clientName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .toLowerCase();
      
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      const fileName = `proposta_emprestimo_${clientNameClean}_${dateStr}.pdf`;
      
      doc.save(fileName);
      
      toast({
        title: "PDF baixado!",
        description: `Proposta baixada: ${fileName}`,
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

  // Buscar histórico de pagamentos
  const fetchPaymentHistory = async (loanId: string) => {
    try {
      const { data, error } = await supabase
        .from('loan_payments')
        .select('*')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      setPaymentHistory(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao buscar histórico",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Visualizar comprovante
  const viewReceipt = async (receiptUrl: string) => {
    try {
      const { data } = await supabase.storage
        .from('client-documents')
        .createSignedUrl(receiptUrl, 3600); // 1 hora de validade

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      } else {
        toast({
          title: "Erro",
          description: "Não foi possível abrir o comprovante.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro ao abrir comprovante",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">Carregando empréstimos...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Empréstimos de {clientName}</h2>
          <p className="text-muted-foreground">Gerencie os pagamentos e parcelas</p>
        </div>
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
      </div>

      {loans.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum empréstimo encontrado</h3>
              <p className="text-muted-foreground">
                Este cliente ainda não possui empréstimos registrados.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {loans.map((loan) => {
            const status = getPaymentStatus(loan);
            const progress = (loan.weeks_paid / loan.total_weeks) * 100;
            const remainingAmount = loan.total_amount - (loan.weeks_paid * loan.weekly_payment);

            return (
              <Card key={loan.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{loan.description}</CardTitle>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(status)}
                      {getStatusBadge(status)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Valor Emprestado</p>
                      <p className="text-lg font-semibold">R$ {loan.loan_amount.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Valor Total</p>
                      <p className="text-lg font-semibold">R$ {loan.total_amount.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Parcela Semanal</p>
                      <p className="text-lg font-semibold">R$ {loan.weekly_payment.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Progresso</span>
                        <span>{loan.weeks_paid} de {loan.total_weeks} parcelas</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Valor Restante</p>
                        <p className="font-medium">R$ {remainingAmount.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Próximo Pagamento</p>
                        <p className="font-medium">
                          {loan.next_payment_date 
                            ? format(new Date(loan.next_payment_date), "dd/MM/yyyy", { locale: ptBR })
                            : "Quitado"
                          }
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 space-y-2">
                      {/* Botões principais */}
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          onClick={() => handleDownloadProposal(loan)}
                          variant="outline"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Baixar PDF
                        </Button>
                        <Button
                          onClick={() => {
                            setShowPaymentHistory(loan.id);
                            fetchPaymentHistory(loan.id);
                          }}
                          variant="outline"
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Histórico
                        </Button>
                      </div>

                      {status !== "completed" && (
                        <div className="grid grid-cols-2 gap-2">
                          {/* Botão de pagamento simples */}
                          <Button
                            onClick={() => registerPayment(loan.id)}
                            disabled={paymentLoading === loan.id}
                            variant="default"
                          >
                            {paymentLoading === loan.id 
                              ? "Registrando..." 
                              : "Pagar Simples"
                            }
                          </Button>

                          {/* Botão de pagamento com comprovante */}
                          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                            <DialogTrigger asChild>
                              <Button
                                onClick={() => {
                                  setSelectedLoanForPayment(loan.id);
                                  setSelectedFile(null);
                                }}
                                variant="secondary"
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
                                <div>
                                  <p className="text-sm text-muted-foreground mb-2">
                                    Valor da parcela: <span className="font-semibold">R$ {loan.weekly_payment.toFixed(2)}</span>
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
                                      setDialogOpen(false);
                                      setSelectedFile(null);
                                      setSelectedLoanForPayment(null);
                                    }}
                                    variant="outline"
                                    className="flex-1"
                                  >
                                    Cancelar
                                  </Button>
                                  <Button
                                    onClick={handlePaymentWithReceipt}
                                    disabled={!selectedFile || uploadingReceipt === loan.id}
                                    className="flex-1"
                                  >
                                    {uploadingReceipt === loan.id ? (
                                      "Enviando..."
                                    ) : (
                                      <>
                                        <Upload className="w-4 h-4 mr-2" />
                                        Confirmar Pagamento
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
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Diálogo do Histórico de Pagamentos */}
      <Dialog open={!!showPaymentHistory} onOpenChange={() => setShowPaymentHistory(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico de Pagamentos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {paymentHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum pagamento registrado ainda.
              </p>
            ) : (
              paymentHistory.map((payment, index) => (
                <div key={payment.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold">Parcela #{payment.week_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(payment.payment_date), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600">
                        R$ {payment.payment_amount.toFixed(2)}
                      </p>
                      {payment.receipt_url && (
                        <Button
                          onClick={() => viewReceipt(payment.receipt_url)}
                          variant="outline"
                          size="sm"
                          className="mt-1"
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          Ver Comprovante
                        </Button>
                      )}
                    </div>
                  </div>
                  {payment.receipt_url && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span>Comprovante anexado</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LoanPayments;
