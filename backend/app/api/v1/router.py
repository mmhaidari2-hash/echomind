from fastapi import APIRouter

from app.api.endpoints import (
    chat,
    conversations,
    consumer_rights,
    delay_repay,
    documents,
    health,
    memory,
    notifications,
    overdraft_shield,
    travel,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(chat.router)
api_router.include_router(conversations.router)
api_router.include_router(delay_repay.router)
api_router.include_router(consumer_rights.router)
api_router.include_router(overdraft_shield.router)
api_router.include_router(documents.router)
api_router.include_router(notifications.router)
api_router.include_router(memory.router)
api_router.include_router(travel.router)
