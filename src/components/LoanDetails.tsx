import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format, isAfter, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, AlertCircle, Clock } from "lucide-react";

interface LoanPayment {
  id: string;
  loan_id: string;
  payment_amount: number;
  payment_date: string;
  week_number: number;
}

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
  next_payment_date: string | null;
  status: string;
}

interface LoanDetailsProps {
  clientId: string;
  onPaymentRegistered: () => void;
}

const LoanDetails = ({ clientId, onPaymentRegistered }: LoanDetailsProps) => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Record<string, LoanPayment[]>>({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  // Buscar empréstimos do cliente
  useEffect(() => {
    const fetchLoans = async () => {
      if (!user || !clientId) return;

      try {
        setLoading(true);
        
        // Buscar empréstimos
        const { data: loansData, error: loansError } = await supabase
          .from("loans")
          .select("*")
          .eq("client_id", clientId)
          .eq("user_id", user.id)
          .order("loan_date", { ascending: false });

        if (loansError) throw loansError;
        setLoans(loansData || []);

        // Buscar pagamentos para cada empréstimo
        if (loansData && loansData.length > 0) {
          const paymentsRecord: Record<string, LoanPayment[]> = {};
          
          for (const loan of loansData) {
            const { data: paymentsData, error: paymentsError } = await supabase
              .from("loan_payments")
              .select("*")
              .eq("loan_id", loan.id)
              .order("week_number", { ascending: true });

            if (paymentsError) throw paymentsError;
            paymentsRecord[loan.id] = paymentsData || [];
          }
          
          setPayments(paymentsRecord);
        }
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

    fetchLoans();
  }, [user, clientId]);

  // Registrar pagamento
  const handleRegisterPayment = async (loan: Loan) => {
    if (!user) return;

    try {
      const newWeeksPaid = loan.weeks_paid + 1;
      const isCompleted = newWeeksPaid >= loan.total_weeks;
      
      // Registrar pagamento
      const { error: paymentError } = await supabase
        .from("loan_payments")
        .insert({
          loan_id: loan.id,
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
        .eq("id", loan.id);

      if (loanError) throw loanError;

      // Se empréstimo foi quitado, restaurar crédito do cliente
      if (isCompleted) {
        const { data: clientData } = await supabase
          .from("clients")
          .select("available_credit, credit_limit")
          .eq("id", clientId)
          .single();

        if (clientData) {
          // Restaurar o crédito do cliente (valor do empréstimo)
          const newAvailableCredit = clientData.available_credit + loan.loan_amount;
          const finalCredit = Math.min(newAvailableCredit, clientData.credit_limit);
          
          const { error: clientError } = await supabase
            .from("clients")
            .update({ available_credit: finalCredit })
            .eq("id", clientId);

          if (clientError) console.warn("Erro ao restaurar crédito:", clientError);
        }
      }

      toast({
        title: "Pagamento registrado!",
        description: isCompleted 
          ? "Empréstimo quitado com sucesso!" 
          : `Pagamento ${newWeeksPaid}/${loan.total_weeks} registrado`,
      });

      onPaymentRegistered();
    } catch (error: any) {
      toast({
        title: "Erro ao registrar pagamento",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Verificar se um pagamento está atrasado
  const isPaymentOverdue = (date: string | null) => {
    if (!date) return false;
    const paymentDate = parseISO(date);
    return isAfter(new Date(), paymentDate);
  };

  // Gerar cronograma de pagamentos
  const generatePaymentSchedule = (loan: Loan) => {
    const schedule = [];
    const loanDate = parseISO(loan.loan_date);
    const loanPayments = payments[loan.id] || [];
    
    for (let week = 1; week <= loan.total_weeks; week++) {
      const paymentDate = new Date(loanDate);
      paymentDate.setDate(paymentDate.getDate() + (week * 7));
      
      const payment = loanPayments.find(p => p.week_number === week);
      const isPaid = payment !== undefined;
      const isOverdue = !isPaid && isAfter(new Date(), paymentDate);
      const isCurrent = week === loan.weeks_paid + 1;
      
      schedule.push({
        week,
        date: format(paymentDate, "dd/MM/yyyy", { locale: ptBR }),
        amount: loan.weekly_payment,
        isPaid,
        isOverdue,
        isCurrent,
        paymentDate: payment?.payment_date ? format(parseISO(payment.payment_date), "dd/MM/yyyy", { locale: ptBR }) : null
      });
    }
    
    return schedule;
  };

  // Obter status do empréstimo com badge
  const getLoanStatusBadge = (loan: Loan) => {
    if (loan.status === "completed") {
      return <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-300">Quitado</Badge>;
    }
    
    if (loan.next_payment_date && isPaymentOverdue(loan.next_payment_date)) {
      return <Badge variant="destructive">Em atraso</Badge>;
    }
    
    return <Badge variant="default">Ativo</Badge>;
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

  if (loans.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">Este cliente não possui empréstimos.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Empréstimos ({loans.length})</h3>
      
      {loans.map((loan) => {
        const paymentSchedule = generatePaymentSchedule(loan);
        const totalPaid = loan.weekly_payment * loan.weeks_paid;
        const remainingAmount = loan.total_amount - totalPaid;
        
        return (
          <Card key={loan.id} className={loan.status === "completed" ? "border-green-200" : ""}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base">
                  {loan.description}
                </CardTitle>
                {getLoanStatusBadge(loan)}
              </div>
              <CardDescription>
                Iniciado em {format(parseISO(loan.loan_date), "dd/MM/yyyy", { locale: ptBR })}
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm"><strong>Valor emprestado:</strong> R$ {loan.loan_amount.toFixed(2)}</p>
                  <p className="text-sm"><strong>Juros:</strong> {loan.interest_rate}%</p>
                  <p className="text-sm"><strong>Valor total:</strong> R$ {loan.total_amount.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm"><strong>Parcela semanal:</strong> R$ {loan.weekly_payment.toFixed(2)}</p>
                  <p className="text-sm"><strong>Progresso:</strong> {loan.weeks_paid}/{loan.total_weeks} semanas</p>
                  {loan.status !== "completed" && (
                    <p className="text-sm"><strong>Valor restante:</strong> R$ {remainingAmount.toFixed(2)}</p>
                  )}
                </div>
              </div>
              
              {/* Barra de progresso */}
              <div className="mt-2 mb-4">
                <div className="flex justify-between text-xs mb-1">
                  <span>Progresso</span>
                  <span>{Math.round((loan.weeks_paid / loan.total_weeks) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      loan.status === "completed" ? "bg-green-500" : "bg-primary"
                    }`}
                    style={{ width: `${(loan.weeks_paid / loan.total_weeks) * 100}%` }}
                  ></div>
                </div>
              </div>
              
              {/* Cronograma de pagamentos */}
              <h4 className="font-semibold text-sm mb-2">Cronograma de Pagamentos</h4>
              <div className="max-h-48 overflow-y-auto border rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Semana</th>
                      <th className="p-2 text-left">Vencimento</th>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentSchedule.map((payment) => (
                      <tr 
                        key={payment.week} 
                        className={`border-t ${
                          payment.isPaid 
                            ? "bg-green-50" 
                            : payment.isOverdue 
                              ? "bg-red-50" 
                              : payment.isCurrent 
                                ? "bg-amber-50" 
                                : ""
                        }`}
                      >
                        <td className="p-2">{payment.week}</td>
                        <td className="p-2">{payment.date}</td>
                        <td className="p-2">
                          <div className="flex items-center">
                            {payment.isPaid ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-green-600 mr-1" />
                                <span className="text-green-600">Pago {payment.paymentDate}</span>
                              </>
                            ) : payment.isOverdue ? (
                              <>
                                <AlertCircle className="w-3 h-3 text-red-600 mr-1" />
                                <span className="text-red-600">Atrasado</span>
                              </>
                            ) : payment.isCurrent ? (
                              <>
                                <Clock className="w-3 h-3 text-amber-600 mr-1" />
                                <span className="text-amber-600">Pendente</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">Agendado</span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-right">R$ {payment.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Botão de registrar pagamento */}
              {loan.status === "active" && loan.weeks_paid < loan.total_weeks && (
                <div className="mt-4">
                  <Button 
                    onClick={() => handleRegisterPayment(loan)}
                    size="sm"
                    className="w-full"
                  >
                    Registrar Pagamento - R$ {loan.weekly_payment.toFixed(2)}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default LoanDetails;
