import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { AssistantConversation, type ConversationNavigation } from '../assistant.conversation';

const ConversationContext = createContext<AssistantConversation | null>(null);

export function AssistantConversationProvider({
  children,
  actorId,
  projectId,
  intent,
  selector,
}: {
  children: ReactNode;
  actorId: number | null;
  projectId: number | null;
  intent: string;
  selector?: { bookCode: string; chapter: number };
}) {
  const [owner] = useState(() => {
    const value = new AssistantConversation();
    value.intent(actorId, projectId, intent, selector);
    return value;
  });
  useLayoutEffect(() => {
    owner.intent(actorId, projectId, intent, selector);
  }, [owner, actorId, projectId, intent, selector]);
  useEffect(() => () => owner.dispose(), [owner]);
  return <ConversationContext.Provider value={owner}>{children}</ConversationContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- co-located consumer of the workspace context
export function useAssistantConversation() {
  const owner = useContext(ConversationContext);
  if (!owner) throw new Error('Assistant requires its drafting workspace owner');
  const state = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return { owner, state };
}

export function AssistantNavigationBridge({ navigation }: { navigation: ConversationNavigation }) {
  const { owner } = useAssistantConversation();
  useLayoutEffect(() => {
    owner.navigate(navigation);
  }, [owner, navigation]);
  return null;
}
