import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import Dashboard from "./Dashboard";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-xl text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <Dashboard />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">Sistema de Cobrança</CardTitle>
          <CardDescription className="text-lg">
            Gerencie seus clientes e cobranças de forma simples e eficiente
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Cadastre clientes, registre débitos e controle pagamentos tudo em um só lugar.
          </p>
          <Button 
            onClick={() => navigate("/auth")}
            className="w-full"
            size="lg"
          >
            <LogIn className="w-5 h-5 mr-2" />
            Fazer Login / Cadastrar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
