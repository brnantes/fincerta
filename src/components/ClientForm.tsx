import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X, Plus, Upload, Camera, Home } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";
import { formatCPF, formatPhone, capitalizeWords } from "@/lib/formatters";

interface ClientFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  full_name: string;
  cpf: string;
  phone: string;
  address: string;
  credit_limit: number;
}

interface Reference {
  name: string;
  phone: string;
  relationship: string;
}

const ClientForm = ({ onClose, onSuccess }: ClientFormProps) => {
  const [formData, setFormData] = useState<FormData>({
    full_name: "",
    cpf: "",
    phone: "",
    address: "",
    credit_limit: 1000,
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [residenceProofFile, setResidenceProofFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [references, setReferences] = useState<Reference[]>([
    { name: "", phone: "", relationship: "" }
  ]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === "full_name") {
      setFormData((prev) => ({
        ...prev,
        [name]: capitalizeWords(value),
      }));
    } else if (name === "cpf") {
      setFormData((prev) => ({
        ...prev,
        [name]: formatCPF(value),
      }));
    } else if (name === "phone") {
      setFormData((prev) => ({
        ...prev,
        [name]: formatPhone(value),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'photo' | 'document' | 'residence' | 'selfie') => {
    const file = e.target.files?.[0];
    if (file) {
      switch(type) {
        case 'photo':
          setPhotoFile(file);
          break;
        case 'document':
          setDocumentFile(file);
          break;
        case 'residence':
          setResidenceProofFile(file);
          break;
        case 'selfie':
          setSelfieFile(file);
          break;
      }
    }
  };

  const handleReferenceChange = (index: number, field: keyof Reference, value: string) => {
    const newReferences = [...references];
    newReferences[index][field] = value;
    setReferences(newReferences);
  };

  const addReference = () => {
    setReferences([...references, { name: "", phone: "", relationship: "" }]);
  };

  const removeReference = (index: number) => {
    if (references.length > 1) {
      const newReferences = [...references];
      newReferences.splice(index, 1);
      setReferences(newReferences);
    }
  };

  const uploadFile = async (file: File, bucket: string, path: string) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    return publicUrl;
  };

  // Função para sanitizar o nome para uso em nomes de arquivos
  const sanitizeFileName = (name: string): string => {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-zA-Z0-9]/g, '_') // Substitui caracteres especiais por underscore
      .toLowerCase();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      let photoUrl = null;
      let documentUrl = null;
      let residenceProofUrl = null;
      let selfieUrl = null;
      
      // Sanitizar o nome do cliente para uso em nomes de arquivos
      const sanitizedName = sanitizeFileName(formData.full_name);

      // Upload photo if provided
      if (photoFile) {
        const photoPath = `${user.id}/${sanitizedName}/${Date.now()}_foto_${photoFile.name}`;
        photoUrl = await uploadFile(photoFile, 'client-photos', photoPath);
      }

      // Upload document photo if provided
      if (documentFile) {
        const documentPath = `${user.id}/${sanitizedName}/${Date.now()}_documento_${documentFile.name}`;
        documentUrl = await uploadFile(documentFile, 'client-documents', documentPath);
      }

      // Upload residence proof if provided
      if (residenceProofFile) {
        const residencePath = `${user.id}/${sanitizedName}/${Date.now()}_comprovante_${residenceProofFile.name}`;
        residenceProofUrl = await uploadFile(residenceProofFile, 'client-documents', residencePath);
      }

      // Upload selfie if provided
      if (selfieFile) {
        const selfiePath = `${user.id}/${sanitizedName}/${Date.now()}_selfie_${selfieFile.name}`;
        selfieUrl = await uploadFile(selfieFile, 'client-photos', selfiePath);
      }

      // Criar um objeto JSON com todos os documentos e referências
      const additionalData = {
        residence_proof_url: residenceProofUrl,
        selfie_url: selfieUrl,
        references: references
      };

      // Armazenar o JSON como string no campo address (temporariamente)
      const fullAddress = `${formData.address} || ${JSON.stringify(additionalData)}`;

      // Insert client data
      const { error, data } = await supabase
        .from("clients")
        .insert({
          user_id: user.id,
          full_name: formData.full_name,
          cpf: formData.cpf,
          phone: formData.phone,
          address: fullAddress,
          photo_url: photoUrl,
          document_photo_url: documentUrl,
          credit_limit: formData.credit_limit,
          available_credit: formData.credit_limit,
          is_first_loan: true,
        })
        .select();

      if (error) throw error;

      // Insert references if client was created successfully
      if (data && data.length > 0) {
        const clientId = data[0].id;
        
        // Filter out empty references
        const validReferences = references.filter(ref => 
          ref.name.trim() !== "" && ref.phone.trim() !== "" && ref.relationship.trim() !== ""
        );
        
        if (validReferences.length > 0) {
          const { error: referencesError } = await supabase
            .from("client_references")
            .insert(
              validReferences.map(ref => ({
                client_id: clientId,
                user_id: user.id,
                name: ref.name,
                phone: ref.phone,
                relationship: ref.relationship
              }))
            );

          if (referencesError) {
            console.error("Erro ao salvar referências:", referencesError);
            // Não vamos interromper o fluxo se falhar ao salvar as referências
          }
        }
      }

      toast({
        title: "Cliente cadastrado!",
        description: "O cliente foi cadastrado com sucesso.",
      });

      onSuccess();
    } catch (error: any) {
      toast({
        title: "Erro ao cadastrar cliente",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-2xl max-h-[90vh] overflow-y-auto w-full p-6 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100"
        >
          <X className="h-4 w-4" />
        </button>
        
        <div className="mb-6">
          <h2 className="text-lg font-semibold">Cadastrar Novo Cliente</h2>
          <p className="text-sm text-gray-500">
            Preencha os dados do cliente abaixo
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Nome Completo</Label>
              <Input
                id="full_name"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                placeholder="Nome completo do cliente"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                name="cpf"
                value={formData.cpf}
                onChange={handleChange}
                placeholder="000.000.000-00"
                maxLength={14}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="(00) 00000-0000"
                maxLength={15}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Endereço</Label>
              <Input
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Endereço completo"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="credit_limit">Limite de Crédito (R$)</Label>
              <Input
                id="credit_limit"
                name="credit_limit"
                type="number"
                min="100"
                max="50000"
                step="50"
                value={formData.credit_limit}
                onChange={(e) => setFormData(prev => ({ ...prev, credit_limit: Number(e.target.value) }))}
                placeholder="1000"
                required
              />
              <p className="text-xs text-muted-foreground">
                Defina o limite de crédito inicial para este cliente
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <Label className="text-sm font-medium">Foto do Cliente</Label>
                <div className="mt-2">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-2 text-gray-400" />
                      <p className="text-xs text-gray-500">Clique para fazer upload</p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => handleFileChange(e, 'photo')}
                    />
                  </label>
                  {photoFile && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-gray-600">{photoFile.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPhotoFile(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <Label className="text-sm font-medium">Selfie com Documento</Label>
                <div className="mt-2">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-2 text-gray-400" />
                      <p className="text-xs text-gray-500">Clique para fazer upload</p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => handleFileChange(e, 'selfie')}
                    />
                  </label>
                  {selfieFile && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-gray-600">{selfieFile.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelfieFile(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <Label className="text-sm font-medium">Foto do Documento</Label>
                <div className="mt-2">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-2 text-gray-400" />
                      <p className="text-xs text-gray-500">Clique para fazer upload</p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => handleFileChange(e, 'document')}
                    />
                  </label>
                  {documentFile && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-gray-600">{documentFile.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDocumentFile(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <Label className="text-sm font-medium">Comprovante de Residência</Label>
                <div className="mt-2">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-2 text-gray-400" />
                      <p className="text-xs text-gray-500">Clique para fazer upload</p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,.pdf"
                      onChange={(e) => handleFileChange(e, 'residence')}
                    />
                  </label>
                  {residenceProofFile && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-gray-600">{residenceProofFile.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setResidenceProofFile(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Separator className="my-4" />
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Contatos de Referência</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addReference}
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Referência
              </Button>
            </div>
            
            {references.map((reference, index) => (
              <div key={index} className="space-y-4 p-4 border rounded-md">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium">Referência {index + 1}</h4>
                  {references.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeReference(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`ref-name-${index}`}>Nome</Label>
                    <Input
                      id={`ref-name-${index}`}
                      value={reference.name}
                      onChange={(e) => handleReferenceChange(index, 'name', e.target.value)}
                      placeholder="Nome completo"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor={`ref-phone-${index}`}>Telefone</Label>
                    <Input
                      id={`ref-phone-${index}`}
                      value={reference.phone}
                      onChange={(e) => handleReferenceChange(index, 'phone', e.target.value)}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor={`ref-relationship-${index}`}>Relação</Label>
                    <Input
                      id={`ref-relationship-${index}`}
                      value={reference.relationship}
                      onChange={(e) => handleReferenceChange(index, 'relationship', e.target.value)}
                      placeholder="Ex: Familiar, Amigo, Colega"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Cadastrando..." : "Cadastrar Cliente"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ClientForm;