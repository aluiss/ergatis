import type { Metadata } from 'next';
import Link from 'next/link';
import { Clause, LegalPage } from '@/components/legal-page';
import { BRAND } from '@/lib/brand';
import { fill, LEGAL_INFO as L } from '@/lib/legal-info';

export const metadata: Metadata = { title: 'Termos de Uso' };

export default function Terms() {
  const contact = fill(L.contactEmail, 'e-mail de contato');
  return (
    <LegalPage title="Termos de Uso">
      <p>
        Estes Termos regem o uso da plataforma {BRAND}, operada por {fill(L.entity, 'razão social')}, CNPJ {fill(L.document, 'CNPJ')}, com sede em {fill(L.address, 'endereço')}. Ao criar uma conta, você concorda com estes Termos e com a <Link className="text-primary" href="/privacidade">Política de Privacidade</Link>.
      </p>
      <Clause title="1. O que a plataforma faz">
        <p>A {BRAND} aproxima pessoas que precisam de um serviço (clientes) de pessoas que os prestam (profissionais). Nós não prestamos os serviços anunciados, não empregamos os profissionais e não somos parte do acordo firmado entre cliente e profissional.</p>
        <p>O preço, a execução e o pagamento do serviço são combinados diretamente entre as partes. A plataforma não recebe, não retém e não repassa esse pagamento.</p>
      </Clause>
      <Clause title="2. Conta">
        <p>Para usar a plataforma, você precisa ter 18 anos ou mais e fornecer dados verdadeiros. Você é responsável pela segurança da sua senha e pelas ações feitas na sua conta.</p>
      </Clause>
      <Clause title="3. Clientes">
        <p>Publicar pedidos e contratar é gratuito. Antes de contratar, cabe ao cliente avaliar o profissional, as condições do serviço e, quando aplicável, exigir habilitação ou registro profissional.</p>
      </Clause>
      <Clause title="4. Profissionais">
        <p>O profissional é responsável pela qualidade e segurança do serviço, pelas licenças e habilitações exigidas para a atividade e pelas obrigações fiscais e trabalhistas decorrentes dela.</p>
      </Clause>
      <Clause title="5. Planos e assinaturas">
        <p>Os planos, benefícios e preços vigentes estão na <Link className="text-primary" href="/planos">página de planos</Link>. As assinaturas são mensais, renovadas automaticamente e cobradas por meio do nosso parceiro de pagamentos.</p>
        <p>Você pode cancelar a qualquer momento. Os benefícios continuam até o fim do período já pago. Se a fatura não for paga, os benefícios podem ser encerrados.</p>
        <p>Na contratação on-line, você pode desistir em até 7 dias da assinatura e receber de volta o valor pago, conforme o artigo 49 do Código de Defesa do Consumidor. Para isso, escreva para {contact}.</p>
        <p>Alterações de preço de assinaturas em andamento serão comunicadas com antecedência.</p>
      </Clause>
      <Clause title="6. Selos e verificação">
        <p>O selo Premium indica apenas que o profissional assina esse plano. Ele não atesta a qualidade do serviço.</p>
        <p>A verificação de perfil indica que analisamos o documento enviado. Ela não é uma garantia sobre a conduta do profissional nem substitui a avaliação do cliente.</p>
      </Clause>
      <Clause title="7. Avaliações">
        <p>Depois de concluído o serviço, cliente e profissional podem se avaliar. As avaliações devem ser verdadeiras. Podemos remover conteúdo que seja falso, ofensivo ou ilegal.</p>
      </Clause>
      <Clause title="8. Condutas proibidas">
        <p>É proibido usar a plataforma para fraude, assédio, discriminação, oferta de serviços ilegais, envio de conteúdo ilícito ou uso de dados de outras pessoas sem autorização.</p>
      </Clause>
      <Clause title="9. Suspensão">
        <p>Podemos suspender ou encerrar contas que violem estes Termos. Você pode denunciar condutas pela área de contratações e excluir sua conta a qualquer momento na página de perfil.</p>
      </Clause>
      <Clause title="10. Responsabilidade">
        <p>Como a plataforma não é parte do acordo entre cliente e profissional, nossa atuação se limita à intermediação do contato, sem prejuízo dos direitos previstos na legislação do consumidor.</p>
      </Clause>
      <Clause title="11. Alterações e contato">
        <p>Podemos atualizar estes Termos e avisaremos sobre mudanças relevantes. Dúvidas: {contact}. Aplica-se a lei brasileira, e o consumidor pode recorrer ao foro do seu domicílio.</p>
      </Clause>
    </LegalPage>
  );
}
