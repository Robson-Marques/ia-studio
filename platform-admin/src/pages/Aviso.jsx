import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageScreen, Button, DSIcon } from '@studio-ux-ds/react';

// Aviso — instancia o **molde `empty` de tela inteira** do DS (`MessageScreen`,
// v1.2.40) nos dois casos que faltavam: **endereço que não existe** e **acesso
// que você não tem**.
//
// Antes os dois davam `<Navigate to="/" replace />`: a pessoa digitava errado, ou
// clicava num link que um colega com mais acesso mandou, e caía no Dashboard sem
// explicação nenhuma. Não havia erro na tela — o que é pior que um erro, porque
// quem clicou conclui que o sistema travou.
//
// Um componente, dois motivos: o arranjo é o mesmo (dizer o que aconteceu e
// oferecer a saída) e só o texto muda. Dois arquivos dariam dois lugares para
// divergir.
export default function Aviso({ motivo = 'nao-encontrado' }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const conteudo = motivo === 'sem-permissao'
    ? {
      icon: 'lock',
      title: 'Você não tem acesso a esta tela',
      description: 'O endereço existe, mas o seu perfil de acesso não inclui esta parte do sistema. Se você precisa dela, peça a quem administra a organização para incluir a permissão no seu perfil.',
    }
    : {
      icon: 'search',
      title: 'Este endereço não existe',
      description: `Não há nada em "${pathname}". Pode ser um link antigo, um endereço digitado com erro, ou uma tela que mudou de lugar.`,
    };

  return (
    <MessageScreen
      icon={conteudo.icon}
      title={conteudo.title}
      description={conteudo.description}
      // A marca acima do card: estas telas podem ser o primeiro contato de alguém
      // que chegou por um link — vale saber onde está.
      above={(
        <div className="flex items-center gap-2" style={{ color: 'var(--su-text-muted)' }}>
          <DSIcon name="spark" size="sm" />
          <span style={{ fontSize: 13 }}>IA Studio</span>
        </div>
      )}
      action={(
        <div className="flex gap-2 flex-wrap justify-center">
          <Button variant="secondary" icon="arrow-left" onClick={() => navigate(-1)}>Voltar</Button>
          <Button variant="primary" icon="home" onClick={() => navigate('/')}>Ir para o início</Button>
        </div>
      )}
    />
  );
}
