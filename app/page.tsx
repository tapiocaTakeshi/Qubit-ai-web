import Chat from "@/components/Chat";
import { getAgentAvailability } from "@/lib/agent-config";

export const dynamic = "force-dynamic";

export default function Home() {
  const availability = getAgentAvailability();
  return <Chat agentEnabled={availability.enabled} agentMessage={availability.message} />;
}
