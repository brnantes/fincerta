import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface Client {
  id: string;
  full_name: string;
  cpf: string;
  credit_limit: number;
  available_credit: number;
  is_first_loan: boolean;
}

interface LoanFormProps {
  clients: Client[];
  onLoanCreated: () => void;
}

const LoanForm = ({ clients, onLoanCreated }: LoanFormProps) => {
  const [selectedClientId, setSelectedClientId] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [totalWeeks, setTotalWeeks] = useState("4");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const selectedClient = clients.find(c => c.id === selectedClientId);

  const calculateLoanDetails = () => {
    if (!selectedClient || !loanAmount) return null;

    const amount = parseFloat(loanAmount);
    const weeks = parseInt(totalWeeks);
    const interestRate = 35; // 35% fixo
    const totalAmount = amount * (1 + interestRate / 100);
    const weeklyPayment = totalAmount / weeks;

    return {
      loanAmount: amount,
      interestRate,
      totalAmount,
      weeklyPayment,
      weeks
    };
  };

  const loanDetails = calculateLoanDetails();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const nextPaymentDate = new Date();
      nextPaymentDate.setDate(nextPaymentDate.getDate() + 7);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (loanDetails.weeks * 7));

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
          next_payment_date: nextPaymentDate.toISOString().split('T')[0],
          status: "active"
        });

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

      toast({
        title: "Empréstimo criado!",
        description: `Empréstimo de R$ ${loanDetails.loanAmount.toFixed(2)} aprovado para ${selectedClient.full_name}`,
      });

      setSelectedClientId("");
      setLoanAmount("");
      setTotalWeeks("4");
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Simular Empréstimo</CardTitle>
        <CardDescription>
          Juros fixo de 35% - Pagamento semanal
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client">Cliente</Label>
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.full_name} - Crédito: R$ {client.available_credit.toFixed(2)}
                    {client.is_first_loan && " (Primeira compra)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedClient && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>Limite de crédito:</strong> R$ {selectedClient.credit_limit.toFixed(2)}<br/>
                <strong>Crédito disponível:</strong> R$ {selectedClient.available_credit.toFixed(2)}<br/>
                {selectedClient.is_first_loan && (
                  <span className="text-orange-600">⚠️ Primeira compra - Limite R$ 500</span>
                )}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount">Valor do Empréstimo (R$)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="1"
              max={selectedClient?.available_credit || 500}
              placeholder="0.00"
              value={loanAmount}
              onChange={(e) => setLoanAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="weeks">Quantidade de Semanas</Label>
            <Select value={totalWeeks} onValueChange={setTotalWeeks}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 semanas</SelectItem>
                <SelectItem value="3">3 semanas</SelectItem>
                <SelectItem value="4">4 semanas</SelectItem>
                <SelectItem value="6">6 semanas</SelectItem>
                <SelectItem value="8">8 semanas</SelectItem>
                <SelectItem value="12">12 semanas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loanDetails && (
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <h4 className="font-semibold mb-2">Simulação do Empréstimo</h4>
              <div className="space-y-1 text-sm">
                <p><strong>Valor emprestado:</strong> R$ {loanDetails.loanAmount.toFixed(2)}</p>
                <p><strong>Juros:</strong> {loanDetails.interestRate}%</p>
                <p><strong>Valor total a pagar:</strong> R$ {loanDetails.totalAmount.toFixed(2)}</p>
                <p><strong>Pagamento semanal:</strong> R$ {loanDetails.weeklyPayment.toFixed(2)}</p>
                <p><strong>Duração:</strong> {loanDetails.weeks} semanas</p>
              </div>
            </div>
          )}

          <Button 
            type="submit" 
            className="w-full" 
            disabled={loading || !selectedClientId || !loanAmount}
          >
            {loading ? "Processando..." : "Aprovar Empréstimo"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default LoanForm;