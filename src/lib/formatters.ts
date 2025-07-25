/**
 * Formata um CPF adicionando pontos e traço (000.000.000-00)
 */
export function formatCPF(value: string): string {
  // Remove todos os caracteres não numéricos
  const cpf = value.replace(/\D/g, '');
  
  // Aplica a máscara de CPF
  if (cpf.length <= 3) {
    return cpf;
  } else if (cpf.length <= 6) {
    return `${cpf.slice(0, 3)}.${cpf.slice(3)}`;
  } else if (cpf.length <= 9) {
    return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6)}`;
  } else {
    return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9, 11)}`;
  }
}

/**
 * Formata um número de telefone adicionando parênteses e hífen (00) 00000-0000
 */
export function formatPhone(value: string): string {
  // Remove todos os caracteres não numéricos
  const phone = value.replace(/\D/g, '');
  
  // Aplica a máscara de telefone
  if (phone.length <= 2) {
    return phone.length ? `(${phone}` : phone;
  } else if (phone.length <= 7) {
    return `(${phone.slice(0, 2)}) ${phone.slice(2)}`;
  } else {
    return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7, 11)}`;
  }
}

/**
 * Capitaliza a primeira letra de cada palavra em uma string
 */
export function capitalizeWords(value: string): string {
  if (!value) return '';
  
  return value
    .toLowerCase()
    .split(' ')
    .map(word => {
      // Ignora palavras vazias
      if (!word) return '';
      
      // Lista de palavras que não devem ser capitalizadas (preposições, artigos, etc.)
      const exceptions = ['e', 'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'em', 'por', 'com'];
      
      // Se for uma exceção e não for a primeira palavra, mantém em minúsculo
      if (exceptions.includes(word) && value.indexOf(word) !== 0) {
        return word;
      }
      
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
