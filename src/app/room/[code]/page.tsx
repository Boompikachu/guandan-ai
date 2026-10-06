import { OnlineApp } from "../../../components/online/OnlineApp";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <OnlineApp initialRoomCode={code} />;
}

