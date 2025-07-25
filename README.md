# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/b4358665-9e77-4373-a6cf-57c135689e6f

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

### 💳 Gestão de Pagamentos
- **Pagamento simples** ou **com comprovante**
- **Upload de comprovantes** (JPG, PNG, PDF)
- **Histórico detalhado** de pagamentos
- **Visualização de comprovantes** com URLs seguras

### 📱 Integração WhatsApp
- **Envio automático** de lembretes
- **Mensagens personalizadas** por status
- **Abertura direta** no WhatsApp Web

### 📊 Dashboard Completo
- **Visão geral** de empréstimos ativos
- **Pagamentos próximos** e em atraso
- **Sistema de logs** para auditoria
- **Interface responsiva** e moderna

## 🛠️ Tecnologias

- **Frontend**: React 18, TypeScript, Vite
- **Estilização**: Tailwind CSS, shadcn/ui
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **PDF**: jsPDF para geração profissional
- **Ícones**: Lucide React
- **Datas**: date-fns com localização PT-BR

## 🚀 Como Executar

### Pré-requisitos
- Node.js 18+
- npm ou yarn
- Conta no Supabase

### Instalação

1. **Clone o repositório:**
```bash
git clone https://github.com/brnantes/fincerta.git
cd fincerta
```

2. **Instale as dependências:**
```bash
npm install
```

3. **Configure as variáveis de ambiente:**
Crie um arquivo `.env.local`:
```env
VITE_SUPABASE_URL=sua_url_do_supabase
VITE_SUPABASE_ANON_KEY=sua_chave_anonima_do_supabase
```

4. **Execute o servidor de desenvolvimento:**
```bash
npm run dev
```

5. **Acesse:** http://localhost:8080

## 📁 Estrutura do Projeto

```
src/
├── components/
│   ├── ui/                 # Componentes base do shadcn/ui
│   ├── ActivityLogs.tsx    # Sistema de logs
│   ├── ClientForm.tsx      # Formulário de clientes
│   ├── ClientList.tsx      # Lista de clientes
│   ├── LoanForm.tsx        # Formulário de empréstimos
│   ├── LoanList.tsx        # Lista de empréstimos (PDF + Delete)
│   ├── LoanSimulator.tsx   # Simulador de empréstimos
│   ├── LoanPayments.tsx    # Gestão de pagamentos
│   └── UpcomingPayments.tsx # Próximos pagamentos
├── hooks/
│   ├── useAuth.ts          # Hook de autenticação
│   └── use-toast.ts        # Hook de notificações
├── integrations/
│   └── supabase/           # Configuração do Supabase
├── pages/
│   └── Dashboard.tsx       # Dashboard principal
└── types/                  # Definições TypeScript
```

## 🎯 Funcionalidades Principais

### 💼 Fluxo Completo de Empréstimo
1. **Cadastro do Cliente** → Informações pessoais e crédito
2. **Simulação** → Valores, juros e parcelas
3. **Aprovação** → Criação do empréstimo
4. **Geração de PDF** → Proposta profissional
5. **Envio WhatsApp** → Comunicação com cliente
6. **Gestão de Pagamentos** → Controle de parcelas
7. **Quitação** → Finalização automática

### 📋 Recursos Avançados
- **Sanitização de nomes** para arquivos PDF
- **Cálculo automático** de datas de vencimento
- **Restauração de crédito** na exclusão
- **Upload seguro** de comprovantes
- **Interface responsiva** para mobile
- **Notificações toast** para feedback

## 🔧 Scripts Disponíveis
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/b4358665-9e77-4373-a6cf-57c135689e6f) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
