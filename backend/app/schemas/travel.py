from typing import Literal

from pydantic import BaseModel, Field


TravelServiceType = Literal["flight", "train", "hotel", "taxi", "bus", "unknown"]
TravelAction = Literal["quote", "confirm"]


class TravelHotel(BaseModel):
    name: str
    nights: int = Field(ge=1, le=14)
    check_in: str


class TravelPricing(BaseModel):
    currency: str = "GBP"
    total: float = Field(ge=0)
    transport: float = Field(ge=0)
    stay: float = Field(ge=0)


class TravelIntentRequest(BaseModel):
    action: TravelAction = "quote"
    query: str | None = Field(default=None, max_length=800)
    locale: str = Field(default="en", pattern="^(en|fa)$")
    intent_id: str | None = Field(default=None, max_length=32)
    confirm_token: str | None = Field(default=None, max_length=512)


class TravelQuote(BaseModel):
    intent_id: str
    destination: str
    origin: str | None = None
    date: str | None = None
    service_type: TravelServiceType
    hotel: TravelHotel | None = None
    estimated_arrival: str
    pricing: TravelPricing
    summary: str
    confirm_token: str
    status: Literal["quoted", "confirmed"] = "quoted"
    locale: str = "en"
