import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Activity, 
  Search, 
  Filter, 
  Download,
  RefreshCw,
  User,
  DollarSign,
  FileText,
  Trash2,
  Plus
} from "lucide-react";

interface ActivityLog {
  id: string;
  action: string;
  description: string;
  user_name: string;
  created_at: string;
  metadata?: any;
}

const ActivityLogs = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const { user } = useAuth();

  // Simular logs baseados nas atividades do sistema
  const generateSystemLogs = () => {
    const mockLogs: ActivityLog[] = [
      {
        id: "1",
        action: "LOGIN",
        description: "Usuário fez login no sistema",
        user_name: user?.email || "Sistema",
        created_at: new Date().toISOString(),
        metadata: { ip: "192.168.1.1" }
      },
      {
        id: "2", 
        action: "CREATE_CLIENT",
        description: "Novo cliente cadastrado: João Silva",
        user_name: user?.email || "Sistema",
        created_at: new Date(Date.now() - 3600000).toISOString(),
        metadata: { client_name: "João Silva", cpf: "123.456.789-00" }
      },
      {
        id: "3",
        action: "CREATE_LOAN", 
        description: "Empréstimo aprovado: R$ 700,00 para João Silva",
        user_name: user?.email || "Sistema",
        created_at: new Date(Date.now() - 7200000).toISOString(),
        metadata: { loan_amount: 700, client_name: "João Silva" }
      },
      {
        id: "4",
        action: "PAYMENT_RECEIVED",
        description: "Pagamento recebido: R$ 325,00 - João Silva",
        user_name: user?.email || "Sistema", 
        created_at: new Date(Date.now() - 10800000).toISOString(),
        metadata: { payment_amount: 325, client_name: "João Silva" }
      },
      {
        id: "5",
        action: "PDF_GENERATED",
        description: "PDF da proposta gerado para João Silva",
        user_name: user?.email || "Sistema",
        created_at: new Date(Date.now() - 14400000).toISOString(),
        metadata: { client_name: "João Silva", document_type: "loan_proposal" }
      }
    ];

    return mockLogs;
  };

  useEffect(() => {
    const loadLogs = () => {
      setLoading(true);
      // Como não temos tabela de logs real, vamos simular
      const systemLogs = generateSystemLogs();
      setLogs(systemLogs);
      setFilteredLogs(systemLogs);
      setLoading(false);
    };

    loadLogs();
  }, [user]);

  // Filtrar logs
  useEffect(() => {
    let filtered = logs;

    // Filtro por termo de busca
    if (searchTerm) {
      filtered = filtered.filter(log => 
        log.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtro por ação
    if (actionFilter !== "all") {
      filtered = filtered.filter(log => log.action === actionFilter);
    }

    // Filtro por data
    if (dateFilter !== "all") {
      const now = new Date();
      const filterDate = new Date();
      
      switch (dateFilter) {
        case "today":
          filterDate.setHours(0, 0, 0, 0);
          filtered = filtered.filter(log => new Date(log.created_at) >= filterDate);
          break;
        case "week":
          filterDate.setDate(now.getDate() - 7);
          filtered = filtered.filter(log => new Date(log.created_at) >= filterDate);
          break;
        case "month":
          filterDate.setMonth(now.getMonth() - 1);
          filtered = filtered.filter(log => new Date(log.created_at) >= filterDate);
          break;
      }
    }

    setFilteredLogs(filtered);
  }, [logs, searchTerm, actionFilter, dateFilter]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case "LOGIN":
        return <User className="w-4 h-4" />;
      case "CREATE_CLIENT":
        return <Plus className="w-4 h-4" />;
      case "CREATE_LOAN":
        return <DollarSign className="w-4 h-4" />;
      case "PAYMENT_RECEIVED":
        return <DollarSign className="w-4 h-4" />;
      case "PDF_GENERATED":
        return <FileText className="w-4 h-4" />;
      case "DELETE_LOAN":
        return <Trash2 className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "LOGIN":
        return <Badge variant="secondary">Login</Badge>;
      case "CREATE_CLIENT":
        return <Badge variant="default">Cliente</Badge>;
      case "CREATE_LOAN":
        return <Badge variant="default">Empréstimo</Badge>;
      case "PAYMENT_RECEIVED":
        return <Badge variant="secondary">Pagamento</Badge>;
      case "PDF_GENERATED":
        return <Badge variant="outline">PDF</Badge>;
      case "DELETE_LOAN":
        return <Badge variant="destructive">Exclusão</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  const exportLogs = () => {
    const csvContent = [
      ["Data/Hora", "Ação", "Descrição", "Usuário"],
      ...filteredLogs.map(log => [
        format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }),
        log.action,
        log.description,
        log.user_name
      ])
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `logs_${format(new Date(), "yyyy-MM-dd", { locale: ptBR })}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Carregando logs...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          <h2 className="text-xl font-semibold">Logs de Atividade</h2>
        </div>
        <Button onClick={exportLogs} variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Buscar</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                <Input
                  placeholder="Buscar por descrição ou usuário..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Ação</label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as ações" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ações</SelectItem>
                  <SelectItem value="LOGIN">Login</SelectItem>
                  <SelectItem value="CREATE_CLIENT">Criar Cliente</SelectItem>
                  <SelectItem value="CREATE_LOAN">Criar Empréstimo</SelectItem>
                  <SelectItem value="PAYMENT_RECEIVED">Pagamento</SelectItem>
                  <SelectItem value="PDF_GENERATED">PDF Gerado</SelectItem>
                  <SelectItem value="DELETE_LOAN">Exclusão</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Período</label>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os períodos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os períodos</SelectItem>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="week">Última semana</SelectItem>
                  <SelectItem value="month">Último mês</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Atividades Recentes ({filteredLogs.length})
          </CardTitle>
          <CardDescription>
            Histórico de ações realizadas no sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma atividade encontrada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-shrink-0 mt-1">
                    {getActionIcon(log.action)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getActionBadge(log.action)}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    
                    <p className="text-sm font-medium text-foreground mb-1">
                      {log.description}
                    </p>
                    
                    <p className="text-xs text-muted-foreground">
                      Por: {log.user_name}
                    </p>
                    
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          Ver detalhes
                        </summary>
                        <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ActivityLogs;
