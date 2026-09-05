from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables and optional .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "EchoMind"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001,"
        "http://localhost:3010,http://127.0.0.1:3010,"
        "https://localhost,http://localhost,capacitor://localhost"
    )
    CORS_ORIGIN_REGEX: str = (
        r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}"
        r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$"
    )
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    TRAVEL_SIGNING_SECRET: str = "echomind-travel-dev"
    PORT: int = 8000

    def cors_origin_list(self) -> list[str]:
        origins = [item.strip() for item in self.CORS_ORIGINS.split(",") if item.strip()]
        if self.ENVIRONMENT.lower() == "production" and "*" in origins:
            raise ValueError("Wildcard CORS is not allowed in production")
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
