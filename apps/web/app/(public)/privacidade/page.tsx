import type { Metadata } from 'next';
import { Clause, LegalPage } from '@/components/legal-page';
import { BRAND } from '@/lib/brand';
import { fill, LEGAL_INFO as L } from '@/lib/legal-info';

export const metadata: Metadata = { title: 'Política de Privacidade' };

export default function Privacy() {
  const contact = fill(L.contactEmail, 'e-mail de contato');
  return (
    <LegalPage title="Política de Privacidade">
      <p>Esta Política explica como {fill(L.entity, 'razão social')}, CNPJ {fill(L.document, 'CNPJ')}, controladora dos dados da plataforma {BRAND}, trata dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
      <Clause title="1. Dados que tratamos">
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Conta:</b> nome, e-mail, senha (guardada de forma criptografada) e registro do aceite destes documentos, com data e endereço IP.</li>
          <li><b>Perfil:</b> telefone, cidade, estado, biografia, foto e, se informadas, coordenadas de localização.</li>
          <li><b>Profissionais:</b> título, categorias, raio de atendimento, imagens do portfólio e documento enviado para verificação.</li>
          <li><b>Biometria facial (profissionais):</b> selfie com prova de vida e o modelo do rosto usado para confirmar a identidade. Veja a seção 3.</li>
          <li><b>Uso da plataforma:</b> pedidos, propostas, contratações, mensagens, avaliações e denúncias.</li>
          <li><b>Assinatura:</b> plano e situação do pagamento. O CPF ou CNPJ informado na assinatura é enviado ao parceiro de pagamentos e não fica guardado no nosso banco de dados.</li>
          <li><b>Técnicos:</b> endereço IP e navegador associados à sessão.</li>
        </ul>
      </Clause>
      <Clause title="2. Finalidades e bases legais">
        <ul className="list-disc space-y-1 pl-5">
          <li>Criar a conta e aproximar clientes e profissionais: execução de contrato.</li>
          <li>Enviar avisos por e-mail sobre propostas, mensagens e sua assinatura: execução de contrato. Você pode desligá-los na página de perfil.</li>
          <li>Cobrar assinaturas: execução de contrato e cumprimento de obrigação legal.</li>
          <li>Prevenir fraudes, analisar denúncias e proteger a plataforma: legítimo interesse.</li>
          <li>Verificar o perfil profissional, quando solicitado: execução de contrato e prevenção à fraude.</li>
          <li>Reconhecimento facial do profissional: consentimento específico (seção 3).</li>
        </ul>
      </Clause>
      <Clause title="3. Biometria facial" id="biometria">
        <p>Biometria é dado pessoal sensível. Só tratamos a do profissional que autoriza, em tela própria, antes de iniciar a verificação. A autorização tem versão e data registradas.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Para quê:</b> confirmar que quem oferece serviços é quem diz ser e, a cada proposta, que é a mesma pessoa. O objetivo é proteger clientes de golpes e contas falsas. Não usamos a biometria para nenhuma outra finalidade, nem para publicidade.</li>
          <li><b>Base legal:</b> consentimento específico e destacado (LGPD, art. 11, I), com a finalidade de prevenção à fraude e segurança na identificação (art. 11, II, g).</li>
          <li><b>Quem processa:</b> a comparação dos rostos e a prova de vida são feitas por {fill(L.faceProvider, 'provedor de reconhecimento facial')}, contratado por nós, que guarda o modelo do rosto em nosso nome.</li>
          <li><b>Quem vê:</b> só a equipe de moderação e a jurídica autorizadas, durante a análise. Cada acesso à selfie ou ao documento fica registrado.</li>
          <li><b>Por quanto tempo:</b> a selfie da verificação é apagada quando a análise termina. O modelo do rosto fica enquanto você for um profissional verificado e é apagado se a verificação for recusada, se você retirar a autorização ou excluir a conta. Das checagens feitas a cada proposta, guardamos só o resultado (aprovada ou não, data e notas), sem imagem.</li>
          <li><b>Retirar a autorização:</b> a qualquer momento, em Perfil › Verificação de identidade. O modelo é apagado na hora; enquanto a verificação for exigida, não será possível enviar propostas.</li>
        </ul>
      </Clause>
      <Clause title="4. O que fica público">
        <p>O perfil profissional mostra nome de exibição, foto, título, biografia, cidade, estado e avaliações. Conforme o plano, mostra também serviços realizados e portfólio. E-mail, telefone e coordenadas não são exibidos nessas páginas.</p>
        <p>Profissionais veem o título, a descrição, a cidade e o estado dos pedidos abertos. No plano Premium, veem também a nota do cliente.</p>
      </Clause>
      <Clause title="5. Com quem compartilhamos">
        <p>Compartilhamos dados com o Asaas, para processar assinaturas, com o provedor de reconhecimento facial (seção 3) e com os provedores de hospedagem e e-mail: {fill(L.infrastructure, 'provedores de hospedagem e e-mail')}. Também podemos compartilhar dados quando exigido por lei ou por autoridade competente. Não vendemos dados pessoais.</p>
      </Clause>
      <Clause title="6. Por quanto tempo guardamos">
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Documento e selfie de verificação:</b> apagados assim que a análise é concluída. Mantemos apenas o resultado e, se aprovado, o modelo facial (seção 3).</li>
          <li><b>Exclusão da conta:</b> removemos nome, e-mail, telefone, localização, biografia, foto, portfólio, documentos e a biometria, inclusive no provedor de reconhecimento facial.</li>
          <li><b>O que permanece após a exclusão:</b> pedidos, contratações, avaliações e mensagens trocadas, sem seu nome, porque fazem parte do histórico da outra pessoa. O texto dessas mensagens e avaliações não é alterado.</li>
          <li><b>Registros de auditoria e de cobrança:</b> mantidos pelo tempo necessário para cumprir obrigações legais e exercer direitos.</li>
        </ul>
      </Clause>
      <Clause title="7. Seus direitos">
        <p>Você pode confirmar o tratamento, acessar, corrigir, solicitar a portabilidade ou a eliminação dos seus dados e revogar consentimentos, entre outros direitos do artigo 18 da LGPD. Na página de perfil, você pode editar seus dados, baixar uma cópia deles e excluir a conta. Para os demais pedidos, escreva para {contact}. Você também pode reclamar à Autoridade Nacional de Proteção de Dados.</p>
      </Clause>
      <Clause title="8. Cookies">
        <p>Usamos apenas os cookies necessários para manter sua sessão. Não usamos cookies de publicidade.</p>
      </Clause>
      <Clause title="9. Segurança">
        <p>Adotamos medidas como senhas criptografadas, controle de acesso, registro de consulta a documentos e exclusão de documentos após o uso. Nenhum sistema é totalmente seguro; em caso de incidente relevante, comunicaremos os titulares e a autoridade, conforme a lei.</p>
      </Clause>
      <Clause title="10. Encarregado e contato">
        <p>Encarregado pelo tratamento de dados: {fill(L.dpoName, 'nome do encarregado')}. Contato: {contact}.</p>
      </Clause>
    </LegalPage>
  );
}
