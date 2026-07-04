import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
  getStoredWorkspaceId, setStoredWorkspaceId,
  getStoredEnvironmentId, setStoredEnvironmentId,
} from '../lib/api';

// Seletor de workspace/ambiente do shell.
//
// Fonte: /auth/me → workspaces: [{ id, name, environments: [] }].
// A selecao persiste em localStorage e o interceptor do axios injeta
// `x-workspace-id` em toda request.

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const { me } = useAuth();
  const workspaces = useMemo(() => me?.workspaces || [], [me]);

  const [workspaceId, setWorkspaceId]     = useState(() => getStoredWorkspaceId());
  const [environmentId, setEnvironmentId] = useState(() => getStoredEnvironmentId());

  // Valida a selecao contra a lista real (workspace removido/sem acesso →
  // cai pro primeiro disponivel).
  useEffect(() => {
    if (!workspaces.length) return;
    const found = workspaces.find((w) => w.id === workspaceId);
    if (!found) {
      const first = workspaces[0];
      setWorkspaceId(first.id);
      setStoredWorkspaceId(first.id);
      const env = (first.environments || [])[0];
      setEnvironmentId(env?.id || '');
      setStoredEnvironmentId(env?.id || '');
      return;
    }
    const envs = found.environments || [];
    if (envs.length && !envs.find((e) => e.id === environmentId)) {
      setEnvironmentId(envs[0].id);
      setStoredEnvironmentId(envs[0].id);
    }
  }, [workspaces, workspaceId, environmentId]);

  const selectWorkspace = useCallback((id) => {
    setWorkspaceId(id);
    setStoredWorkspaceId(id);
    const ws = workspaces.find((w) => w.id === id);
    const env = (ws?.environments || [])[0];
    setEnvironmentId(env?.id || '');
    setStoredEnvironmentId(env?.id || '');
  }, [workspaces]);

  const selectEnvironment = useCallback((id) => {
    setEnvironmentId(id);
    setStoredEnvironmentId(id);
  }, []);

  const workspace   = workspaces.find((w) => w.id === workspaceId) || null;
  const environment = (workspace?.environments || []).find((e) => e.id === environmentId) || null;

  const value = {
    workspaces, workspace, environment,
    workspaceId, environmentId,
    selectWorkspace, selectEnvironment,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace deve ser usado dentro de <WorkspaceProvider>');
  return ctx;
}
