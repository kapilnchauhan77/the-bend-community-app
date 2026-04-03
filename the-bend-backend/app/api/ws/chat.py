from uuid import UUID
from fastapi import WebSocket, WebSocketDisconnect
import json

from app.core.security import decode_access_token


class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self):
        self.active: dict[str, set[WebSocket]] = {}  # user_id -> set of WebSocket

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(user_id, set()).add(ws)

    def disconnect(self, user_id: str, ws: WebSocket):
        if user_id in self.active:
            self.active[user_id].discard(ws)
            if not self.active[user_id]:
                del self.active[user_id]

    async def send_to_user(self, user_id: str, message: dict):
        for ws in self.active.get(user_id, []):
            try:
                await ws.send_json(message)
            except Exception:
                pass

    def is_online(self, user_id: str) -> bool:
        return user_id in self.active


manager = ConnectionManager()


async def websocket_chat(websocket: WebSocket):
    """WebSocket endpoint for real-time chat."""
    # Authenticate
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except Exception:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    await manager.connect(user_id, websocket)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                msg_type = message.get("type")

                if msg_type == "message":
                    thread_id = message.get("thread_id")
                    content = message.get("content")
                    if thread_id and content:
                        # Persist message via service
                        from app.database import async_session
                        from app.services.message_service import MessageService
                        async with async_session() as session:
                            service = MessageService(session)
                            msg = await service.send_message(
                                UUID(thread_id), UUID(user_id), content
                            )
                            await session.commit()

                            # Get thread to find other participant
                            thread = await service.message_repo.get_thread_by_id(UUID(thread_id))
                            if thread:
                                other_id = str(thread.participant_b) if str(thread.participant_a) == user_id else str(thread.participant_a)
                                await manager.send_to_user(other_id, {
                                    "type": "message",
                                    "data": {
                                        "id": str(msg.id),
                                        "thread_id": thread_id,
                                        "sender_id": user_id,
                                        "content": content,
                                        "created_at": str(msg.created_at),
                                    },
                                })

                elif msg_type == "typing":
                    thread_id = message.get("thread_id")
                    if thread_id:
                        from app.database import async_session
                        from app.repositories.message_repo import MessageRepository
                        async with async_session() as session:
                            repo = MessageRepository(session)
                            thread = await repo.get_thread_by_id(UUID(thread_id))
                            if thread:
                                other_id = str(thread.participant_b) if str(thread.participant_a) == user_id else str(thread.participant_a)
                                await manager.send_to_user(other_id, {
                                    "type": "typing",
                                    "data": {"thread_id": thread_id, "user_id": user_id},
                                })

                elif msg_type == "read":
                    thread_id = message.get("thread_id")
                    if thread_id:
                        from app.database import async_session
                        from app.repositories.message_repo import MessageRepository
                        async with async_session() as session:
                            repo = MessageRepository(session)
                            await repo.mark_thread_read(UUID(thread_id), UUID(user_id))
                            await session.commit()
                            thread = await repo.get_thread_by_id(UUID(thread_id))
                            if thread:
                                other_id = str(thread.participant_b) if str(thread.participant_a) == user_id else str(thread.participant_a)
                                await manager.send_to_user(other_id, {
                                    "type": "read",
                                    "data": {"thread_id": thread_id, "user_id": user_id},
                                })

            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "data": {"code": "INVALID_JSON", "message": "Invalid JSON"}})

    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
