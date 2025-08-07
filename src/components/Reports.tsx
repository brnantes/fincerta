import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  DollarSign, 
  Users, 
  FileText,
  Download,
  Eye,
  EyeOff
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MonthlyReport {
  month: string;
  totalLoaned: number;
  totalReceived: number;
  newLoans: number;
  completedLoans: number;
  profit: number;
}

interface ClientReport {
  client_name: string;
  total_loans: number;
  total_amount: number;
  total_paid: number;
  profit: number;
  status: 'active' | 'completed' | 'mixed';
}

export default function Reports() {
  const [monthlyReports, setMonthlyReports] = useState<MonthlyReport[]>([]);
  const [clientReports, setClientReports] = useState<ClientReport[]>([]);
  const [showValues, setShowValues] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadMonthlyReports(),
        loadClientReports()
      ]);
    } catch (error) {
      console.error('Erro ao carregar relatórios:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMonthlyReports = async () => {
    const { data: loans } = await supabase
      .from('loans')
      .select(`
        *,
        loan_payments(*)
      `);

    if (!loans) return;

    // Gerar relatórios dos últimos 6 meses
    const reports: MonthlyReport[] = [];
    
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      
      const monthLoans = loans.filter(loan => {
        const loanDate = parseISO(loan.created_at);
        return loanDate >= monthStart && loanDate <= monthEnd;
      });

      // Calcular pagamentos do mês com deduplificação por semana
      let totalReceived = 0;
      
      loans.forEach(loan => {
        // Filtrar pagamentos do mês
        const loanMonthPayments = loan.loan_payments.filter((payment: any) => {
          const paymentDate = parseISO(payment.payment_date);
          return paymentDate >= monthStart && paymentDate <= monthEnd;
        });
        
        // Deduplificar por week_number
        const uniquePayments = new Map();
        loanMonthPayments.forEach((payment: any) => {
          const weekKey = payment.week_number || `${payment.payment_date}_${payment.id}`;
          if (!uniquePayments.has(weekKey) || 
              new Date(payment.payment_date) < new Date(uniquePayments.get(weekKey).payment_date)) {
            uniquePayments.set(weekKey, payment);
          }
        });
        
        // Somar apenas pagamentos únicos
        totalReceived += Array.from(uniquePayments.values())
          .reduce((sum: number, payment: any) => sum + Number(payment.payment_amount), 0);
      });

      const totalLoaned = monthLoans.reduce((sum, loan) => sum + loan.loan_amount, 0);
      const completedLoans = monthLoans.filter(loan => loan.status === 'completed').length;

      reports.push({
        month: format(date, 'MMM/yyyy', { locale: ptBR }),
        totalLoaned,
        totalReceived,
        newLoans: monthLoans.length,
        completedLoans,
        profit: totalReceived - totalLoaned
      });
    }

    setMonthlyReports(reports);
  };

  const loadClientReports = async () => {
    const { data: loans } = await supabase
      .from('loans')
      .select(`
        *,
        clients(name),
        loan_payments(*)
      `);

    if (!loans) return;

    const clientMap = new Map<string, ClientReport>();

    loans.forEach(loan => {
      const clientName = loan.clients?.name || 'Cliente Desconhecido';
      
      // Deduplificar pagamentos por week_number
      const uniquePayments = new Map();
      loan.loan_payments.forEach((payment: any) => {
        const weekKey = payment.week_number || `${payment.payment_date}_${payment.id}`;
        if (!uniquePayments.has(weekKey) || 
            new Date(payment.payment_date) < new Date(uniquePayments.get(weekKey).payment_date)) {
          uniquePayments.set(weekKey, payment);
        }
      });
      
      const totalPaid = Array.from(uniquePayments.values())
        .reduce((sum: number, payment: any) => sum + Number(payment.payment_amount), 0);
      
      if (!clientMap.has(clientName)) {
        clientMap.set(clientName, {
          client_name: clientName,
          total_loans: 0,
          total_amount: 0,
          total_paid: 0,
          profit: 0,
          status: 'active'
        });
      }

      const client = clientMap.get(clientName)!;
      client.total_loans += 1;
      client.total_amount += loan.loan_amount;
      client.total_paid += totalPaid;
      client.profit = client.total_paid - client.total_amount;

      // Determinar status
      const hasActive = loans.some(l => l.clients?.name === clientName && l.status === 'active');
      const hasCompleted = loans.some(l => l.clients?.name === clientName && l.status === 'completed');
      
      if (hasActive && hasCompleted) {
        client.status = 'mixed';
      } else if (hasActive) {
        client.status = 'active';
      } else {
        client.status = 'completed';
      }
    });

    setClientReports(Array.from(clientMap.values()).sort((a, b) => b.profit - a.profit));
  };

  const formatCurrency = (value: number) => {
    return showValues ? `R$ ${value.toFixed(2)}` : '••••••';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="outline" className="text-orange-600 border-orange-200">Ativo</Badge>;
      case 'completed':
        return <Badge variant="outline" className="text-green-600 border-green-200">Quitado</Badge>;
      case 'mixed':
        return <Badge variant="outline" className="text-blue-600 border-blue-200">Misto</Badge>;
      default:
        return null;
    }
  };

  const totalStats = monthlyReports.reduce((acc, month) => ({
    totalLoaned: acc.totalLoaned + month.totalLoaned,
    totalReceived: acc.totalReceived + month.totalReceived,
    totalProfit: acc.totalProfit + month.profit,
    totalLoans: acc.totalLoans + month.newLoans
  }), { totalLoaned: 0, totalReceived: 0, totalProfit: 0, totalLoans: 0 });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Relatórios</h1>
            <p className="text-muted-foreground">Análise detalhada do desempenho financeiro</p>
          </div>
        </div>
        <div className="text-center py-8">
          <p className="text-muted-foreground">Carregando relatórios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">Análise detalhada do desempenho financeiro</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowValues(!showValues)}
          >
            {showValues ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
            {showValues ? 'Ocultar Valores' : 'Mostrar Valores'}
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Cards de Resumo Geral */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Emprestado (6 meses)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalStats.totalLoaned)}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalStats.totalLoans} empréstimos realizados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Recebido (6 meses)</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalStats.totalReceived)}
            </div>
            <p className="text-xs text-muted-foreground">
              Pagamentos recebidos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {totalStats.totalProfit >= 0 ? 'Lucro Total' : 'Prejuízo Total'}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              totalStats.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {formatCurrency(totalStats.totalProfit)}
            </div>
            <p className="text-xs text-muted-foreground">
              Últimos 6 meses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {clientReports.filter(c => c.status === 'active' || c.status === 'mixed').length}
            </div>
            <p className="text-xs text-muted-foreground">
              {clientReports.length} clientes total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs de Relatórios */}
      <Tabs defaultValue="monthly" className="space-y-4">
        <TabsList>
          <TabsTrigger value="monthly">Relatório Mensal</TabsTrigger>
          <TabsTrigger value="clients">Relatório por Cliente</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Desempenho Mensal (Últimos 6 Meses)
              </CardTitle>
              <CardDescription>
                Análise mês a mês dos empréstimos e recebimentos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {monthlyReports.map((month, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium">{month.month}</h4>
                        <Badge variant="outline">
                          {month.newLoans} empréstimos
                        </Badge>
                        {month.completedLoans > 0 && (
                          <Badge variant="outline" className="text-green-600 border-green-200">
                            {month.completedLoans} quitados
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-4 mt-2 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">Emprestado:</span><br/>
                          {formatCurrency(month.totalLoaned)}
                        </div>
                        <div>
                          <span className="font-medium">Recebido:</span><br/>
                          {formatCurrency(month.totalReceived)}
                        </div>
                        <div>
                          <span className="font-medium">Resultado:</span><br/>
                          <span className={month.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatCurrency(month.profit)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${
                        month.profit >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {month.profit >= 0 ? '+' : ''}{formatCurrency(month.profit)}
                      </div>
                      <div className="text-xs text-muted-foreground">resultado</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clients">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Desempenho por Cliente
              </CardTitle>
              <CardDescription>
                Análise detalhada do histórico de cada cliente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {clientReports.map((client, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium">{client.client_name}</h4>
                        {getStatusBadge(client.status)}
                        <Badge variant="outline">
                          {client.total_loans} empréstimo{client.total_loans !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mt-2 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">Total Emprestado:</span><br/>
                          {formatCurrency(client.total_amount)}
                        </div>
                        <div>
                          <span className="font-medium">Total Pago:</span><br/>
                          {formatCurrency(client.total_paid)}
                        </div>
                        <div>
                          <span className="font-medium">Resultado:</span><br/>
                          <span className={client.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatCurrency(client.profit)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${
                        client.profit >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {client.profit >= 0 ? '+' : ''}{formatCurrency(client.profit)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {client.profit >= 0 ? 'lucro' : 'prejuízo'}
                      </div>
                    </div>
                  </div>
                ))}
                
                {clientReports.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum cliente encontrado
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
