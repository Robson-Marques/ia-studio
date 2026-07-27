import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, Button, EmptyState, DSIcon } from '@studio-ux-ds/react';

// Aviso — as duas telas que faltavam: **endereço que não existe** e **acesso que
// você não tem**. Criadas na v0.10.20.
//
// Antes, os dois casos davam `<Navigate to="/" replace />`: a pessoa digitava um
// endereço errado, ou clicava num link que um colega com mais acesso mandou, e
// **caía no Dashboard sem explicação**. Não havia erro nenhum na tela — o que é
// pior que um erro, porque quem clicou conclui que o sistema travou ou que o
// clique não pegou.
//
// Um componente, dois motivos: o desenho é o mesmo (dizer o que aconteceu e
// oferecer a saída), e o que muda é o texto. Separar em dois arquivos daria dois
// lugares para divergir.
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
    <div className="space-y-6">
      {/* Marca discreta: estas telas podem ser o primeiro contato de alguém que
          chegou por um link — vale saber onde está. */}
      <div className="flex items-center gap-2" style={{ color: 'var(--su-text-muted)' }}>
        <DSIcon name="spark" size="sm" />
        <span style={{ fontSize: 13 }}>IA Studio</span>
      </div>

      <Card>
        <EmptyState
          icon={conteudo.icon}
          title={conteudo.title}
          description={conteudo.description}
          action={
            <div className="flex gap-2 flex-wrap justify-center">
              <Button variant="secondary" icon="arrow-left" onClick={() => navigate(-1)}>
                Voltar
              </Button>
              <Button variant="primary" icon="home" onClick={() => navigate('/')}>
                Ir para o início
              </Button>
            </div>
          }
        />
      </Card>
    </div>
  );
}
