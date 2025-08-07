import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { activityLogger, ActivityLog } from '@/utils/activityLogger';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Activity, 
  Search, 
  RefreshCw,
  User,
  DollarSign,
  LogIn,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  Settings,
  Trash2
} from 'lucide-react';

const ActivityLogs = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<ActivityLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Carregar logs do sistema real
  const loadSystemLogs = () => {
    const allLogs = activityLogger.getLogs({ limit: 200 });
    setLogs(allLogs);
    console.log(`📊 ${allLogs.length} logs carregados para visualização`);
  };

  // Filtrar logs
  const filterLogs = () => {
    let filtered = [...logs];

    // Filtro por texto
    if (searchTerm) {
      filtered = filtered.filter(log => 
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtro por tipo
    if (typeFilter !== 'all') {
      filtered = filtered.filter(log => log.type === typeFilter);
    }

    // Filtro por usuário
    if (userFilter !== 'all') {
      filtered = filtered.filter(log => log.user === userFilter);
    }

    setFilteredLogs(filtered);
  };

  // Obter ícone por tipo de log
  const getLogIcon = (type: ActivityLog['type']) => {
    switch (type) {
      case 'login': return <LogIn className="w-4 h-4" />;
      case 'payment': return <CreditCard className="w-4 h-4" />;
      case 'create': return <CheckCircle className="w-4 h-4" />;
      case 'update': return <Settings className="w-4 h-4" />;
      case 'delete': return <Trash2 className="w-4 h-4" />;
      case 'system': return <Activity className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  // Obter cor da badge por tipo
  const getBadgeVariant = (type: ActivityLog['type']) => {
    switch (type) {
      case 'login': return 'default';
      case 'payment': return 'default';
      case 'create': return 'default';
      case 'update': return 'secondary';
      case 'delete': return 'destructive';
      case 'system': return 'outline';
      default: return 'outline';
    }
  };

  // Obter usuários únicos para filtro
  const getUniqueUsers = () => {
    const users = [...new Set(logs.map(log => log.user))];
    return users.filter(user => user !== 'Sistema');
  };

  // Efeitos
  useEffect(() => {
    loadSystemLogs();
  }, []);

  useEffect(() => {
    filterLogs();
  }, [logs, searchTerm, typeFilter, userFilter]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadSystemLogs, 5000); // Atualizar a cada 5 segundos
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Logs de Atividade
              </CardTitle>
              <CardDescription>
                Acompanhe todas as atividades do sistema em tempo real
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={autoRefresh ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                Auto Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={loadSystemLogs}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="payment">Pagamentos</SelectItem>
                <SelectItem value="create">Criações</SelectItem>
                <SelectItem value="update">Atualizações</SelectItem>
                <SelectItem value="delete">Exclusões</SelectItem>
                <SelectItem value="system">Sistema</SelectItem>
              </SelectContent>
            </Select>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filtrar por usuário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os usuários</SelectItem>
                {getUniqueUsers().map(user => (
                  <SelectItem key={user} value={user}>{user}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Estatísticas */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{logs.length}</div>
                <div className="text-sm text-gray-600">Total de Logs</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{filteredLogs.length}</div>
                <div className="text-sm text-gray-600">Logs Filtrados</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{getUniqueUsers().length}</div>
                <div className="text-sm text-gray-600">Usuários Ativos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">
                  {logs.filter(log => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    return new Date(log.timestamp) >= today;
                  }).length}
                </div>
                <div className="text-sm text-gray-600">Logs Hoje</div>
              </CardContent>
            </Card>
          </div>

          {/* Lista de Logs */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum log encontrado</p>
              </div>
            ) : (
              filteredLogs.map((log) => (
                <Card key={log.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        {getLogIcon(log.type)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={getBadgeVariant(log.type)} className="text-xs">
                            {log.type.toUpperCase()}
                          </Badge>
                          <span className="font-medium">{log.action}</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{log.details}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {log.user}
                          </div>
                          <div>
                            {format(new Date(log.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                          </div>
                          {log.entity && (
                            <div>
                              {log.entity} {log.entityId && `(${log.entityId})`}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ActivityLogs;
