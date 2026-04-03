from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import get_settings
from app.core.exceptions import AppException

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown
    from app.database import engine
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Exception handlers
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.detail,
            headers={"Retry-After": str(exc.retry_after)} if hasattr(exc, 'retry_after') else None,
        )

    # Include routers
    from app.api.v1.router import api_router
    app.include_router(api_router, prefix=settings.API_PREFIX)

    # WebSocket chat
    from app.api.ws.chat import websocket_chat

    @app.websocket("/api/v1/ws/chat")
    async def ws_chat(websocket: WebSocket):
        await websocket_chat(websocket)

    return app


app = create_app()
