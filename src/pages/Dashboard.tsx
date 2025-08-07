import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlusCircle, Users, DollarSign, FileText, LogOut, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ClientList from "@/components/ClientList";
import LoanList from "@/components/LoanList";
import ClientForm from "@/components/ClientForm";
import LoanForm from "@/components/LoanForm";
import LoanSimulator from "@/components/LoanSimulator";
import LoanDetails from "@/components/LoanDetails";
import LoanPayments from "@/components/LoanPayments";
import UpcomingPayments from "@/components/UpcomingPayments";
import ActivityLogs from "@/components/ActivityLogs";
import CashFlow from "@/components/CashFlow";
import Reports from "@/components/Reports";


const Dashboard = () => {
  const { signOut, user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [showClientForm, setShowClientForm] = useState(false);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showLoanSimulator, setShowLoanSimulator] = useState(false);
  const [selectedClientForLoans, setSelectedClientForLoans] = useState<string | null>(null);
  const [selectedClientForPayments, setSelectedClientForPayments] = useState<{ id: string; name: string } | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [clients, setClients] = useState([]);
  const [loanStats, setLoanStats] = useState({
    activeLoans: 0,
    totalLent: 0,
    pendingPayments: 0
  });

  const fetchClients = async () => {
    if (!user) return;
    const { data } = await supabase.from("clients").select("*").eq("user_id", user.id);
    setClients(data || []);
  };

  const fetchLoanStats = async () => {
    if (!user) return;
    
    try {
      // Buscar empréstimos ativos
      const { data: activeLoans, error: activeError } = await supabase
        .from("loans")
        .select("loan_amount, total_amount, weekly_payment, total_weeks, weeks_paid")
        .eq("user_id", user.id)
        .eq("status", "active");
      
      if (activeError) throw activeError;
      
      // Calcular estatísticas
      const totalLent = activeLoans?.reduce((sum, loan) => sum + loan.loan_amount, 0) || 0;
      const pendingPayments = activeLoans?.reduce((sum, loan) => sum + (loan.total_weeks - loan.weeks_paid), 0) || 0;
      
      setLoanStats({
        activeLoans: activeLoans?.length || 0,
        totalLent,
        pendingPayments
      });
    } catch (error) {
      console.error("Erro ao buscar estatísticas de empréstimos:", error);
    }
  };

  useEffect(() => {
    fetchClients();
    fetchLoanStats();
  }, [user, refreshTrigger]);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Sistema de Cobrança</h1>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="clients">Clientes</TabsTrigger>
            <TabsTrigger value="loans">Empréstimos</TabsTrigger>
            <TabsTrigger value="cashflow">Caixa</TabsTrigger>
            <TabsTrigger value="reports">Relatórios</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{clients.length}</div>
                  <p className="text-xs text-muted-foreground">Clientes cadastrados</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Empréstimos Ativos</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">R$ {loanStats.totalLent.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">{loanStats.activeLoans} empréstimos ativos</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pagamentos Pendentes</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{loanStats.pendingPayments}</div>
                  <p className="text-xs text-muted-foreground">Parcelas a receber</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Ações Rápidas</CardTitle>
                  <CardDescription>Acesse as funcionalidades principais</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    onClick={() => setShowClientForm(true)} 
                    className="w-full justify-start"
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Cadastrar Cliente
                  </Button>
                  <Button 
                    onClick={() => setShowLoanSimulator(true)} 
                    variant="outline" 
                    className="w-full justify-start"
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Simular Empréstimo
                  </Button>
                  <Button 
                    onClick={() => setActiveTab("cashflow")} 
                    variant="outline" 
                    className="w-full justify-start"
                  >
                    <Wallet className="mr-2 h-4 w-4" />
                    Ver Caixa
                  </Button>
                </CardContent>
              </Card>

              <div className="md:col-span-2">
                <UpcomingPayments />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="clients">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Clientes</h2>
                <Button onClick={() => setShowClientForm(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Novo Cliente
                </Button>
              </div>
              
              {selectedClientForPayments ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Detalhes do Cliente</h3>
                    <Button 
                      variant="outline" 
                      onClick={() => setSelectedClientForPayments(null)}
                    >
                      Voltar para Lista
                    </Button>
                  </div>
                  
                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <LoanDetails 
                        clientId={selectedClientForPayments.id} 
                        onPaymentRegistered={() => setRefreshTrigger(prev => prev + 1)} 
                      />
                    </div>
                    <div>
                      <Button 
                        onClick={() => {
                          setShowLoanSimulator(true);
                        }}
                        className="w-full mb-4"
                      >
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Simular Novo Empréstimo
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <ClientList 
                  onAddClient={() => setShowClientForm(true)} 
                  onClientSelect={(clientId) => {
                    // Buscar nome do cliente
                    const fetchClientName = async () => {
                      const { data } = await supabase
                        .from("clients")
                        .select("full_name")
                        .eq("id", clientId)
                        .single();
                      
                      if (data) {
                        setSelectedClientForPayments({ id: clientId, name: data.full_name });
                      }
                    };
                    fetchClientName();
                  }}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="loans">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Empréstimos</h2>
                <Button onClick={() => setShowLoanSimulator(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Simular Empréstimo
                </Button>
              </div>
              
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <LoanList refreshTrigger={refreshTrigger} />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="cashflow">
            <CashFlow />
          </TabsContent>

          <TabsContent value="reports">
            <Reports />
          </TabsContent>

          <TabsContent value="logs">
            <ActivityLogs />
          </TabsContent>
        </Tabs>

        {/* Modal Forms */}
        {showClientForm && (
          <ClientForm 
            onClose={() => setShowClientForm(false)}
            onSuccess={() => {
              setShowClientForm(false);
              setRefreshTrigger(prev => prev + 1);
              // Optionally switch to clients tab after success
              setActiveTab("clients");
            }}
          />
        )}

        {showLoanForm && (
          <LoanForm 
            clients={clients}
            onLoanCreated={() => {
              setShowLoanForm(false);
              setRefreshTrigger(prev => prev + 1);
              setActiveTab("loans");
            }}
          />
        )}
        
        {showLoanSimulator && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="p-4 flex justify-between items-center border-b">
                <h2 className="text-xl font-bold">Simulação de Empréstimo</h2>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowLoanSimulator(false)}
                >
                  ✕
                </Button>
              </div>
              <div className="p-4">
                <LoanSimulator
                  onLoanCreated={() => {
                    setShowLoanSimulator(false);
                    setRefreshTrigger(prev => prev + 1);
                    setActiveTab("loans");
                  }}
                  onBack={() => setShowLoanSimulator(false)}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;