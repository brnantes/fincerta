// Sistema de logs de atividades do FinCerta
export interface ActivityLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  entity: string;
  entityId?: string;
  details: string;
  type: 'create' | 'update' | 'delete' | 'payment' | 'login' | 'system';
}

class ActivityLogger {
  private logs: ActivityLog[] = [];
  private currentUser: string = 'Sistema';

  setCurrentUser(username: string) {
    this.currentUser = username;
    this.log('Login realizado', 'Sistema', undefined, `Usuário ${username} fez login às ${new Date().toLocaleString('pt-BR')}`, 'login');
  }

  log(
    action: string,
    entity: string,
    entityId?: string,
    details?: string,
    type: ActivityLog['type'] = 'system'
  ) {
    const logEntry: ActivityLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      user: this.currentUser,
      action,
      entity,
      entityId,
      details: details || `${action} realizada em ${entity}`,
      type
    };

    this.logs.unshift(logEntry); // Adiciona no início para mostrar mais recentes primeiro
    
    // Manter apenas os últimos 1000 logs para não sobrecarregar a memória
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(0, 1000);
    }

    // Log detalhado no console
    const timestamp = new Date().toLocaleString('pt-BR');
    console.log(`🔍 [${type.toUpperCase()}] ${timestamp} - ${this.currentUser}: ${action} - ${entity} ${entityId || ''}`);
    if (details) {
      console.log(`   📝 Detalhes: ${details}`);
    }
    
    return logEntry;
  }

  // Métodos específicos para diferentes tipos de ações
  logClientAction(action: string, clientName: string, clientId: string, details?: string) {
    return this.log(action, 'Cliente', clientId, details || `${action} cliente: ${clientName}`, 
      action.includes('Criar') || action.includes('Adicionar') ? 'create' :
      action.includes('Editar') || action.includes('Atualizar') ? 'update' :
      action.includes('Excluir') || action.includes('Deletar') ? 'delete' : 'system'
    );
  }

  logLoanAction(action: string, clientName: string, loanId: string, amount?: number, details?: string) {
    const amountText = amount ? ` de R$ ${amount.toFixed(2)}` : '';
    return this.log(action, 'Empréstimo', loanId, 
      details || `${action} empréstimo${amountText} para ${clientName}`,
      action.includes('Criar') || action.includes('Aprovar') ? 'create' :
      action.includes('Editar') || action.includes('Atualizar') ? 'update' :
      action.includes('Excluir') || action.includes('Cancelar') ? 'delete' : 'system'
    );
  }

  logPaymentAction(action: string, clientName: string, loanId: string, amount: number, weekNumber: number, details?: string) {
    return this.log(action, 'Pagamento', `${loanId}_week_${weekNumber}`, 
      details || `${action} pagamento de R$ ${amount.toFixed(2)} (semana ${weekNumber}) - ${clientName}`,
      'payment'
    );
  }

  logSystemAction(action: string, details: string) {
    return this.log(action, 'Sistema', undefined, details, 'system');
  }

  // Obter logs com filtros
  getLogs(filter?: {
    user?: string;
    type?: ActivityLog['type'];
    entity?: string;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }): ActivityLog[] {
    let filteredLogs = [...this.logs];

    if (filter?.user) {
      filteredLogs = filteredLogs.filter(log => 
        log.user.toLowerCase().includes(filter.user!.toLowerCase())
      );
    }

    if (filter?.type) {
      filteredLogs = filteredLogs.filter(log => log.type === filter.type);
    }

    if (filter?.entity) {
      filteredLogs = filteredLogs.filter(log => 
        log.entity.toLowerCase().includes(filter.entity!.toLowerCase())
      );
    }

    if (filter?.startDate) {
      filteredLogs = filteredLogs.filter(log => 
        new Date(log.timestamp) >= filter.startDate!
      );
    }

    if (filter?.endDate) {
      filteredLogs = filteredLogs.filter(log => 
        new Date(log.timestamp) <= filter.endDate!
      );
    }

    if (filter?.limit) {
      filteredLogs = filteredLogs.slice(0, filter.limit);
    }

    return filteredLogs;
  }

  // Obter estatísticas dos logs
  getStats() {
    const total = this.logs.length;
    const byType = this.logs.reduce((acc, log) => {
      acc[log.type] = (acc[log.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byUser = this.logs.reduce((acc, log) => {
      acc[log.user] = (acc[log.user] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayLogs = this.logs.filter(log => new Date(log.timestamp) >= today).length;

    return {
      total,
      todayLogs,
      byType,
      byUser
    };
  }

  // Limpar logs antigos
  clearOldLogs(daysToKeep: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const initialCount = this.logs.length;
    this.logs = this.logs.filter(log => new Date(log.timestamp) >= cutoffDate);
    const removedCount = initialCount - this.logs.length;
    
    if (removedCount > 0) {
      this.logSystemAction('Limpeza de logs', `Removidos ${removedCount} logs antigos (mais de ${daysToKeep} dias)`);
    }
  }
}

// Instância global do logger
export const activityLogger = new ActivityLogger();

// Inicializar com log do sistema
activityLogger.logSystemAction('Sistema iniciado', 'FinCerta - Sistema de Cobrança iniciado');
