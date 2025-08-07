
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { supabaseAdmin } from "@/integrations/supabase/admin-client";
import { useAuth } from "@/hooks/useAuth";
import { activityLogger } from "@/utils/activityLogger";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  ArrowUp, 
  ArrowDown, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Wallet,
  Eye,
  EyeOff,
  RefreshCw,
  Clock,
  CheckCircle
} from "lucide-react";

interface LoanSummary {
  id: string;
  client_name: string;
  loan_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_remaining: number;
  status: string;
  next_payment_date: string;
  loan_date: string;
  weeks_paid: number;
  total_weeks: number;
}

interface CashSummary {
  totalLoaned: number;
  totalReceived: number;
  totalInStreet: number;
  cashBalance: number;
  activeLoansCount: number;
  completedLoansCount: number;
}

const CashFlow = () => {
  const [cashSummary, setCashSummary] = useState<CashSummary>({
    totalLoaned: 0,
    totalReceived: 0,
    totalInStreet: 0,
    cashBalance: 0,
    activeLoansCount: 0,
    completedLoansCount: 0
  });
  
  const [activeLoans, setActiveLoans] = useState<LoanSummary[]>([]);
  const [completedLoans, setCompletedLoans] = useState<LoanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBalance, setShowBalance] = useState(true);
  const [initialBalance, setInitialBalance] = useState<string>('10000');
  const [showInitialBalanceInput, setShowInitialBalanceInput] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();

  // Carregar dados do caixa
  const loadCashFlowData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      console.log(`💰 Carregando dados do fluxo de caixa...`);
      activityLogger.logSystemAction('Carregando caixa', 'Iniciando carregamento dos dados do fluxo de caixa');
      
      // Carregar todos os empréstimos com pagamentos
      const { data: loansData, error: loansError } = await supabase
        .from('loans')
        .select(`
          *,
          clients(full_name),
          loan_payments(id, payment_amount, payment_date, week_number)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (loansError) {
        console.log(`❌ Erro ao carregar dados do caixa:`, loansError);
        activityLogger.logSystemAction('Erro no caixa', `Falha ao carregar dados: ${loansError.message}`);
        throw loansError;
      }
      
      console.log(`📈 ${loansData?.length || 0} empréstimos carregados para análise do caixa`);

      // Processar dados dos empréstimos
      const activeLoansData: LoanSummary[] = [];
      const completedLoansData: LoanSummary[] = [];
      
      let totalLoanedAmount = 0;
      let totalReceivedAmount = 0;

      loansData?.forEach(loan => {
        // Deduplificar pagamentos por semana (considerar apenas 1 pagamento por week_number)
        const uniquePayments = new Map();
        loan.loan_payments?.forEach((payment: any) => {
          const weekKey = payment.week_number || `${payment.payment_date}_${payment.id}`; // Fallback se week_number for null
          if (!uniquePayments.has(weekKey) || 
              new Date(payment.payment_date) < new Date(uniquePayments.get(weekKey).payment_date)) {
            uniquePayments.set(weekKey, payment);
          }
        });
        
        const totalPaid = Array.from(uniquePayments.values())
          .reduce((sum: number, payment: any) => sum + Number(payment.payment_amount), 0);
        const remaining = Number(loan.total_amount) - totalPaid;
        
        const loanSummary: LoanSummary = {
          id: loan.id,
          client_name: loan.clients?.full_name || 'N/A',
          loan_amount: Number(loan.loan_amount),
          total_amount: Number(loan.total_amount),
          amount_paid: totalPaid,
          amount_remaining: remaining,
          status: loan.status,
          next_payment_date: loan.next_payment_date || '',
          loan_date: loan.loan_date,
          weeks_paid: loan.weeks_paid || 0,
          total_weeks: loan.total_weeks || 0
        };

        totalLoanedAmount += loanSummary.loan_amount;
        totalReceivedAmount += totalPaid;

        if (loan.status === 'pending' && remaining > 0) {
          activeLoansData.push(loanSummary);
        } else {
          completedLoansData.push(loanSummary);
        }
      });

      setActiveLoans(activeLoansData);
      setCompletedLoans(completedLoansData);

      // Calcular resumo do caixa
      const totalInStreet = activeLoansData.reduce((sum, loan) => sum + loan.amount_remaining, 0);
      // Saldo em caixa = apenas o dinheiro que já voltou através dos pagamentos
      const cashBalance = totalReceivedAmount;
      
      console.log(`📊 Resumo do Caixa Calculado:`);
      console.log(`   💵 Total Emprestado: R$ ${totalLoanedAmount.toFixed(2)}`);
      console.log(`   💰 Total Recebido: R$ ${totalReceivedAmount.toFixed(2)}`);
      console.log(`   🛣️ Total na Rua: R$ ${totalInStreet.toFixed(2)}`);
      console.log(`   🏦 Saldo em Caixa: R$ ${cashBalance.toFixed(2)}`);
      console.log(`   📈 Empréstimos Ativos: ${activeLoansData.length}`);
      console.log(`   ✅ Empréstimos Quitados: ${completedLoansData.length}`);
      
      activityLogger.logSystemAction(
        'Caixa calculado',
        `Resumo: R$ ${totalLoanedAmount.toFixed(2)} emprestado, R$ ${totalReceivedAmount.toFixed(2)} recebido, ${activeLoansData.length} ativos, ${completedLoansData.length} quitados`
      );

      setCashSummary({
        totalLoaned: totalLoanedAmount,
        totalReceived: totalReceivedAmount,
        totalInStreet,
        cashBalance: cashBalance,
        activeLoansCount: activeLoansData.length,
        completedLoansCount: completedLoansData.length
      });

    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados do caixa",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Atualizar saldo inicial
  const handleUpdateInitialBalance = () => {
    const newBalance = Number(initialBalance);
    if (newBalance < 0) {
      toast({
        title: "Valor inválido",
        description: "O saldo inicial deve ser um valor positivo.",
        variant: "destructive",
      });
      return;
    }

    setShowInitialBalanceInput(false);
    loadCashFlowData(); // Recarregar dados com novo saldo
    
    toast({
      title: "Saldo inicial atualizado!",
      description: `Novo saldo inicial: R$ ${newBalance.toFixed(2)}`,
    });
  };

  useEffect(() => {
    loadCashFlowData();
  }, [user, initialBalance]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <span className="ml-2">Carregando dados do caixa...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Sistema de Caixa</h1>
          <p className="text-muted-foreground">Controle financeiro completo</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBalance(!showBalance)}
          >
            {showBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showBalance ? 'Ocultar' : 'Mostrar'} Valores
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadCashFlowData}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total na Rua (Principal + Juros) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total na Rua</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {showBalance ? `R$ ${cashSummary.totalInStreet.toFixed(2)}` : '••••••'}
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Principal: R$ {showBalance ? (cashSummary.totalLoaned - cashSummary.totalReceived).toFixed(2) : '•••'}</p>
              <p>Juros: R$ {showBalance ? (cashSummary.totalInStreet - (cashSummary.totalLoaned - cashSummary.totalReceived)).toFixed(2) : '•••'}</p>
              <p>{cashSummary.activeLoansCount} empréstimos ativos</p>
            </div>
          </CardContent>
        </Card>

        {/* Retorno de Caixa */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Retorno de Caixa</CardTitle>
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {showBalance ? `R$ ${cashSummary.totalReceived.toFixed(2)}` : '••••••'}
            </div>
            <p className="text-xs text-muted-foreground">
              Dinheiro que já voltou dos pagamentos
            </p>
          </CardContent>
        </Card>

        {/* Resultado Atual */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {(cashSummary.totalReceived - cashSummary.totalLoaned) >= 0 ? 'Lucro Geral' : 'Prejuízo Geral'}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              (cashSummary.totalReceived - cashSummary.totalLoaned) >= 0 
                ? 'text-green-600' 
                : 'text-red-600'
            }`}>
              {showBalance ? `R$ ${(cashSummary.totalReceived - cashSummary.totalLoaned).toFixed(2)}` : '••••••'}
            </div>
            <p className="text-xs text-muted-foreground">
              {(cashSummary.totalReceived - cashSummary.totalLoaned) >= 0 ? 'Lucro dos empréstimos' : 'Ainda falta voltar para equilibrar'}
            </p>
          </CardContent>
        </Card>

        {/* Saldo Disponível */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Disponível</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {showBalance ? `R$ ${(Number(initialBalance) - cashSummary.totalLoaned + cashSummary.totalReceived).toFixed(2)}` : '••••••'}
            </div>
            <p className="text-xs text-muted-foreground">
              Disponível para novos empréstimos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Configuração do Saldo Inicial */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Configuração do Caixa
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!showInitialBalanceInput ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Saldo Inicial do Caixa</p>
                <p className="text-sm text-muted-foreground">
                  Valor base para cálculos: {showBalance ? `R$ ${Number(initialBalance).toFixed(2)}` : '••••••'}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowInitialBalanceInput(true)}
              >
                Alterar
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="initial-balance">Novo Saldo Inicial</Label>
                <Input
                  id="initial-balance"
                  type="number"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  placeholder="Ex: 10000"
                />
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={handleUpdateInitialBalance}>
                  Salvar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowInitialBalanceInput(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Empréstimos Ativos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-500" />
            Empréstimos Ativos ({cashSummary.activeLoansCount})
          </CardTitle>
          <CardDescription>
            Empréstimos em aberto que ainda estão sendo pagos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeLoans.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum empréstimo ativo no momento
            </p>
          ) : (
            <div className="space-y-3">
              {activeLoans.map((loan) => (
                <div
                  key={loan.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{loan.client_name}</h4>
                      <Badge variant="outline" className="text-orange-600 border-orange-200">
                        {loan.weeks_paid}/{loan.total_weeks} parcelas
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2 text-sm">
                      <div className="text-muted-foreground">
                        <span className="font-medium">Emprestado:</span><br/>
                        {showBalance ? `R$ ${loan.loan_amount.toFixed(2)}` : '••••••'}
                      </div>
                      <div className="text-muted-foreground">
                        <span className="font-medium">Pago:</span><br/>
                        {showBalance ? `R$ ${loan.amount_paid.toFixed(2)}` : '••••••'}
                      </div>
                      <div className="text-muted-foreground">
                        <span className="font-medium">Restante:</span><br/>
                        {showBalance ? `R$ ${loan.amount_remaining.toFixed(2)}` : '••••••'}
                      </div>
                      <div className={`font-medium ${
                        (loan.amount_paid - loan.loan_amount) >= 0 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }`}>
                        <span className="text-muted-foreground font-medium">
                          {(loan.amount_paid - loan.loan_amount) >= 0 ? 'Lucro:' : 'Prejuízo:'}
                        </span><br/>
                        {showBalance ? `R$ ${(loan.amount_paid - loan.loan_amount).toFixed(2)}` : '••••••'}
                      </div>
                      <div className="text-muted-foreground">
                        <span className="font-medium">Próximo:</span><br/>
                        {loan.next_payment_date ? format(new Date(loan.next_payment_date), 'dd/MM/yyyy') : 'N/A'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-orange-600">
                      {showBalance ? `R$ ${loan.amount_remaining.toFixed(2)}` : '••••••'}
                    </div>
                    <div className="text-xs text-muted-foreground">na rua</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Empréstimos Quitados */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Empréstimos Quitados ({cashSummary.completedLoansCount})
          </CardTitle>
          <CardDescription>
            Empréstimos que já foram totalmente pagos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {completedLoans.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum empréstimo quitado ainda
            </p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {completedLoans.slice(0, 10).map((loan) => (
                <div
                  key={loan.id}
                  className="flex items-center justify-between p-4 border rounded-lg bg-green-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{loan.client_name}</h4>
                      <Badge variant="outline" className="text-green-600 border-green-200">
                        Quitado
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-2 text-sm text-muted-foreground">
                      <div>
                        <span className="font-medium">Emprestado:</span> {showBalance ? `R$ ${loan.loan_amount.toFixed(2)}` : '••••••'}
                      </div>
                      <div>
                        <span className="font-medium">Recebido:</span> {showBalance ? `R$ ${loan.amount_paid.toFixed(2)}` : '••••••'}
                      </div>
                      <div>
                        <span className="font-medium">Lucro:</span> {showBalance ? `R$ ${(loan.amount_paid - loan.loan_amount).toFixed(2)}` : '••••••'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-600">
                      ✓ Quitado
                    </div>
                  </div>
                </div>
              ))}
              {completedLoans.length > 10 && (
                <p className="text-center text-sm text-muted-foreground">
                  ... e mais {completedLoans.length - 10} empréstimos quitados
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CashFlow;
