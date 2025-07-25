import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Eye, Edit, Trash2, FileText, Users, RefreshCw, Download, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Reference {
  id: string;
  client_id: string;
  name: string;
  phone: string;
  relationship: string;
}

interface Client {
  id: string;
  full_name: string;
  cpf: string;
  phone: string;
  address: string;
  email?: string;
  photo_url?: string;
  document_photo_url?: string;
  residence_proof_url?: string;
  selfie_url?: string;
  credit_limit: number;
  available_credit: number;
  is_first_loan: boolean;
  created_at: string;
  references?: Reference[];
}

interface ClientListProps {
  onAddClient: () => void;
  onClientSelect?: (clientId: string) => void;
}

const ClientList = ({ onAddClient, onClientSelect }: ClientListProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  // Função para fazer download de imagens
  const handleDownloadImage = async (url: string, fileName: string) => {
    try {
      if (!url) {
        toast({
          title: "Erro ao baixar arquivo",
          description: "URL da imagem não encontrada.",
          variant: "destructive",
        });
        return;
      }
      
      // Mostrar indicador de carregamento
      toast({
        title: "Baixando arquivo",
        description: "Aguarde enquanto o arquivo é baixado...",
      });

      // Buscar a imagem
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Erro ao buscar imagem: ${response.status} ${response.statusText}`);
      }
      
      // Extrair a extensão original do URL
      let originalExtension = 'jpg'; // Padrão
      
      // Tentar obter a extensão do URL
      const urlParts = url.split('?')[0].split('.');
      if (urlParts.length > 1) {
        originalExtension = urlParts.pop()?.toLowerCase() || 'jpg';
      }
      
      // Verificar se a extensão é válida (algumas URLs podem ter extensões inválidas)
      const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'pdf'];
      if (!validExtensions.includes(originalExtension)) {
        // Tentar detectar o tipo de conteúdo da resposta
        const contentType = response.headers.get('content-type');
        if (contentType) {
          if (contentType.includes('png')) originalExtension = 'png';
          else if (contentType.includes('jpeg') || contentType.includes('jpg')) originalExtension = 'jpg';
          else if (contentType.includes('gif')) originalExtension = 'gif';
          else if (contentType.includes('webp')) originalExtension = 'webp';
          else if (contentType.includes('svg')) originalExtension = 'svg';
          else if (contentType.includes('pdf')) originalExtension = 'pdf';
          else if (contentType.includes('bmp')) originalExtension = 'bmp';
        }
      }
      
      // Garantir que o nome do arquivo tenha a extensão correta
      const fileNameWithCorrectExt = fileName.includes('.') 
        ? fileName.substring(0, fileName.lastIndexOf('.')) + '.' + originalExtension
        : fileName + '.' + originalExtension;

      const blob = await response.blob();
      
      // Criar um objeto URL para o blob
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Criar um elemento de link temporário
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileNameWithCorrectExt;
      
      // Adicionar ao documento, clicar e remover
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Liberar o objeto URL
      window.URL.revokeObjectURL(blobUrl);
      
      toast({
        title: "Download concluído",
        description: `Arquivo ${fileNameWithCorrectExt} baixado com sucesso!`,
      });
    } catch (error) {
      console.error('Erro ao baixar a imagem:', error);
      toast({
        title: "Erro ao baixar arquivo",
        description: error instanceof Error ? error.message : "Ocorreu um erro ao tentar baixar o arquivo.",
        variant: "destructive",
      });
    }
  };
  
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchClients = async () => {
    if (!user) return;
    
    setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Processar os clientes para extrair dados JSON do campo address
      const processedClients = (data || []).map(client => {
        try {
          // Verificar se o endereço contém dados JSON
          if (client.address && client.address.includes('||')) {
            const [actualAddress, jsonDataStr] = client.address.split(' || ');
            const jsonData = JSON.parse(jsonDataStr);
            
            // Log para debug
            console.log('Cliente processado:', client.full_name, {
              photo_url: client.photo_url,
              document_photo_url: client.document_photo_url,
              selfie_url: jsonData.selfie_url,
              residence_proof_url: jsonData.residence_proof_url
            });
            
            return {
              ...client,
              address: actualAddress,
              residence_proof_url: jsonData.residence_proof_url || null,
              selfie_url: jsonData.selfie_url || null,
              document_photo_url: client.document_photo_url || null,
              photo_url: client.photo_url || null,
              references: jsonData.references || []
            };
          }
          return client;
        } catch (e) {
          console.error('Erro ao processar dados do cliente:', e);
          return client;
        }
      });
      
      setClients(processedClients);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar clientes",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  const fetchClientDetails = async (clientId: string) => {
    try {
      // Buscar diretamente do Supabase para garantir dados atualizados
      const { data: clientData, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();
      
      if (error) throw error;
      if (!clientData) throw new Error("Cliente não encontrado");
      
      // Extrair dados adicionais do campo address
      let address = clientData.address;
      let references: Reference[] = [];
      let residence_proof_url = null;
      let selfie_url = null;
      let document_photo_url = clientData.document_photo_url || null;
      let photo_url = clientData.photo_url || null;
      
      // Verificar se o endereço contém dados JSON
      if (address && address.includes(" || ")) {
        const [actualAddress, jsonData] = address.split(" || ");
        address = actualAddress;
        
        try {
          const additionalData = JSON.parse(jsonData);
          residence_proof_url = additionalData.residence_proof_url || null;
          selfie_url = additionalData.selfie_url || null;
          references = additionalData.references || [];
          
          // Verificar se as URLs das imagens estão no JSON (caso tenham sido movidas)
          if (additionalData.document_photo_url) {
            document_photo_url = additionalData.document_photo_url;
          }
          
          if (additionalData.photo_url) {
            photo_url = additionalData.photo_url;
          }
        } catch (e) {
          console.error("Erro ao extrair dados JSON do endereço:", e);
        }
      }
      
      // Log para debug
      console.log("Imagens do cliente:", {
        photo_url,
        document_photo_url,
        selfie_url,
        residence_proof_url
      });
      
      const clientWithDetails = {
        ...clientData,
        address,
        photo_url,
        document_photo_url,
        residence_proof_url,
        selfie_url,
        references
      };
      
      // Atualizar o estado
      setSelectedClient(clientWithDetails);
      setShowDetails(true);
    } catch (error: any) {
      console.error("Erro ao carregar detalhes do cliente:", error);
      toast({
        title: "Erro ao carregar detalhes",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchClients();
  }, [user]);

  // Filtrar clientes baseado no termo de busca
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredClients(clients);
      return;
    }

    const normalizedSearchTerm = searchTerm.toLowerCase().trim();
    
    const filtered = clients.filter(client => {
      return (
        client.full_name.toLowerCase().includes(normalizedSearchTerm) ||
        client.cpf.replace(/\D/g, '').includes(normalizedSearchTerm.replace(/\D/g, ''))
      );
    });
    
    setFilteredClients(filtered);
  }, [searchTerm, clients]);

  const handleDelete = async (clientId: string) => {
    if (!confirm("Tem certeza que deseja excluir este cliente?")) return;

    try {
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", clientId);

      if (error) throw error;

      toast({
        title: "Cliente excluído",
        description: "Cliente foi removido com sucesso.",
      });

      fetchClients();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir cliente",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">Carregando clientes...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-muted-foreground">Gerencie seus clientes cadastrados</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchClients}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Atualizando...' : 'Atualizar'}
          </Button>
        </div>
      </div>
      
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Buscar por nome ou CPF"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 w-full max-w-sm"
        />
      </div>
      
      {/* Modal de detalhes do cliente */}
      {selectedClient && (
        <Dialog open={showDetails} onOpenChange={setShowDetails}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalhes do Cliente</DialogTitle>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <div>
                <h3 className="text-lg font-medium mb-4">Informações Pessoais</h3>
                <div className="space-y-2">
                  <p><strong>Nome:</strong> {selectedClient.full_name}</p>
                  <p><strong>CPF:</strong> {selectedClient.cpf}</p>
                  <p><strong>Telefone:</strong> {selectedClient.phone}</p>
                  <p><strong>Endereço:</strong> {selectedClient.address.includes(" || ") ? selectedClient.address.split(" || ")[0] : selectedClient.address}</p>
                  {selectedClient.email && (
                    <p><strong>Email:</strong> {selectedClient.email}</p>
                  )}
                </div>
                
                <h3 className="text-lg font-medium mt-6 mb-4">Informações Financeiras</h3>
                <div className="space-y-2">
                  <p><strong>Limite de Crédito:</strong> R$ {selectedClient.credit_limit.toFixed(2)}</p>
                  <p><strong>Crédito Disponível:</strong> R$ {selectedClient.available_credit.toFixed(2)}</p>
                  {selectedClient.is_first_loan && (
                    <Badge variant="secondary">Primeira compra</Badge>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-4">Documentos</h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* Foto do cliente */}
                  <Card className="overflow-hidden">
                    <CardHeader className="p-2">
                      <CardTitle className="text-sm">Foto</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 relative">
                      {selectedClient.photo_url ? (
                        <>
                          <img 
                            src={selectedClient.photo_url} 
                            alt="Foto do cliente" 
                            className="w-full h-32 object-cover"
                          />
                          <button 
                            onClick={() => handleDownloadImage(selectedClient.photo_url, `foto_${selectedClient.full_name.replace(/\s+/g, '_')}`)}
                            className="absolute bottom-2 right-2 bg-white p-1 rounded-full shadow-md hover:bg-gray-100"
                            title="Baixar foto"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <div className="w-full h-32 flex items-center justify-center bg-muted">
                          <p className="text-xs text-muted-foreground">Foto não disponível</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  
                  {/* Documento */}
                  <Card className="overflow-hidden">
                    <CardHeader className="p-2">
                      <CardTitle className="text-sm">Documento</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 relative">
                      {selectedClient.document_photo_url ? (
                        <>
                          <img 
                            src={selectedClient.document_photo_url} 
                            alt="Documento" 
                            className="w-full h-32 object-cover"
                          />
                          <button 
                            onClick={() => handleDownloadImage(selectedClient.document_photo_url, `documento_${selectedClient.full_name.replace(/\s+/g, '_')}`)}
                            className="absolute bottom-2 right-2 bg-white p-1 rounded-full shadow-md hover:bg-gray-100"
                            title="Baixar documento"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <div className="w-full h-32 flex items-center justify-center bg-muted">
                          <p className="text-xs text-muted-foreground">Documento não disponível</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  
                  {/* Selfie */}
                  <Card className="overflow-hidden">
                    <CardHeader className="p-2">
                      <CardTitle className="text-sm">Selfie com Documento</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 relative">
                      {selectedClient.selfie_url ? (
                        <>
                          <img 
                            src={selectedClient.selfie_url} 
                            alt="Selfie" 
                            className="w-full h-32 object-cover"
                          />
                          <button 
                            onClick={() => handleDownloadImage(selectedClient.selfie_url, `selfie_${selectedClient.full_name.replace(/\s+/g, '_')}`)}
                            className="absolute bottom-2 right-2 bg-white p-1 rounded-full shadow-md hover:bg-gray-100"
                            title="Baixar selfie"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <div className="w-full h-32 flex items-center justify-center bg-muted">
                          <p className="text-xs text-muted-foreground">Selfie não disponível</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  
                  {/* Comprovante de Residência */}
                  <Card className="overflow-hidden">
                    <CardHeader className="p-2">
                      <CardTitle className="text-sm">Comprovante de Residência</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 relative">
                      {selectedClient.residence_proof_url ? (
                        <>
                          <img 
                            src={selectedClient.residence_proof_url} 
                            alt="Comprovante de Residência" 
                            className="w-full h-32 object-cover"
                          />
                          <button 
                            onClick={() => handleDownloadImage(selectedClient.residence_proof_url, `comprovante_${selectedClient.full_name.replace(/\s+/g, '_')}`)}
                            className="absolute bottom-2 right-2 bg-white p-1 rounded-full shadow-md hover:bg-gray-100"
                            title="Baixar comprovante"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <div className="w-full h-32 flex items-center justify-center bg-muted">
                          <p className="text-xs text-muted-foreground">Comprovante não disponível</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
                
                <h3 className="text-lg font-medium mt-6 mb-4">Contatos de Referência</h3>
                {selectedClient.references && selectedClient.references.length > 0 ? (
                  <div className="space-y-3">
                    {selectedClient.references.map((ref, index) => (
                      <Card key={ref.id || index}>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Users className="w-4 h-4" />
                            <strong>{ref.name}</strong>
                          </div>
                          <p className="text-sm"><strong>Telefone:</strong> {ref.phone}</p>
                          <p className="text-sm"><strong>Relação:</strong> {ref.relationship}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Nenhuma referência cadastrada</p>
                )}
              </div>
            </div>
            
            <div className="flex justify-end mt-6">
              <Button onClick={() => setShowDetails(false)}>Fechar</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {filteredClients.length === 0 && !loading ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center py-8">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {searchTerm ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
              </h3>
              <p className="text-muted-foreground text-center mb-4">
                {searchTerm 
                  ? `Não encontramos clientes correspondentes à busca "${searchTerm}".` 
                  : "Você ainda não possui clientes cadastrados. Clique no botão abaixo para adicionar seu primeiro cliente."}
              </p>
              {!searchTerm && (
                <Button onClick={onAddClient}>
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Adicionar Cliente
                </Button>
              )}
              {searchTerm && (
                <Button variant="outline" onClick={() => setSearchTerm("")}>Limpar busca</Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredClients.map((client) => (
            <Card key={client.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <div className="flex items-center p-4 border-b">
                {client.photo_url ? (
                  <img 
                    src={client.photo_url} 
                    alt={client.full_name}
                    className="w-12 h-12 rounded-full object-cover mr-3 border-2 border-primary/20"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mr-3">
                    <Users className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-base truncate">{client.full_name}</h3>
                  <p className="text-sm text-muted-foreground">CPF: {client.cpf}</p>
                </div>
              </div>
              <div className="p-3 bg-muted/30 flex justify-between items-center">
                <div>
                  <span className="text-xs font-medium">R$ {client.available_credit.toFixed(2)}</span>
                  {client.is_first_loan && (
                    <Badge variant="secondary" className="ml-2 text-xs">1ª compra</Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => fetchClientDetails(client.id)}
                    title="Ver detalhes"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  {onClientSelect && (
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8 text-primary hover:text-primary"
                      onClick={() => onClientSelect(client.id)}
                      title="Ver empréstimos"
                    >
                      <FileText className="w-4 h-4" />
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-8 w-8"
                    title="Editar cliente"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(client.id)}
                    title="Excluir cliente"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientList;