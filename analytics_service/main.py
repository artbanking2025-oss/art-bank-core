"""
Art Bank Core Analytics Service
Аналитический центр для расчёта справедливых цен (Fair Value) и оценки рисков
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import numpy as np
from scipy.stats import gaussian_kde
from scipy.spatial.distance import cosine
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Art Bank Core Analytics Service",
    description="Аналитический центр для расчёта справедливых цен на арт-активы",
    version="1.0.0"
)

# CORS для взаимодействия с маршрутизатором
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== Модели данных ====================

class HistoricalPrice(BaseModel):
    """Исторические цены аналогичных активов"""
    asset_id: str
    price: float
    sale_date: str
    similarity_score: float = Field(ge=0, le=1)  # Схожесть с оцениваемым активом


class TrustMetric(BaseModel):
    """Репутационные метрики участников"""
    node_id: str
    node_type: str  # artist, gallery, expert, bank, collector
    trust_level: float = Field(ge=0, le=1)
    weight: float = Field(ge=0, le=1)  # Вес в итоговом расчёте


class ContextEvent(BaseModel):
    """Контекстные события"""
    event_type: str  # exhibition, mention, validation, sale
    impact_score: float = Field(ge=-1, le=1)  # Влияние на цену
    timestamp: str


class FairPriceRequest(BaseModel):
    """Запрос на расчёт справедливой цены"""
    asset_id: str
    current_price: Optional[float] = None
    historical_prices: List[HistoricalPrice]
    trust_metrics: List[TrustMetric]
    context_events: List[ContextEvent] = []


class FairPriceResponse(BaseModel):
    """Ответ с расчётом справедливой цены"""
    asset_id: str
    fair_value: float
    confidence_interval: tuple[float, float]
    risk_score: float
    reasoning: Dict[str, Any]


class RiskScoreRequest(BaseModel):
    """Запрос на расчёт коэффициента риска"""
    asset_id: str
    price: float
    fair_value: float
    liquidity_score: float = Field(ge=0, le=1)
    trust_metrics: List[TrustMetric]


class RiskScoreResponse(BaseModel):
    """Ответ с оценкой риска"""
    asset_id: str
    risk_score: float
    risk_level: str  # low, medium, high
    factors: Dict[str, float]


# ==================== Математические функции ====================

def calculate_kde(prices: List[float], weights: List[float]) -> gaussian_kde:
    """
    Kernel Density Estimation (KDE)
    Строит тепловую карту распределения цен с учётом весов (схожести активов)
    """
    if not prices:
        raise ValueError("Список цен не может быть пустым")
    
    prices_array = np.array(prices)
    weights_array = np.array(weights)
    
    # Нормализация весов
    weights_array = weights_array / weights_array.sum()
    
    # Создание KDE с взвешенными данными
    kde = gaussian_kde(prices_array, weights=weights_array)
    return kde


def estimate_fair_value(kde: gaussian_kde, price_range: tuple[float, float]) -> tuple[float, tuple[float, float]]:
    """
    Оценка справедливой цены на основе KDE
    Возвращает медиану и 95% доверительный интервал
    """
    # Генерация точек для оценки плотности
    x = np.linspace(price_range[0], price_range[1], 1000)
    density = kde.evaluate(x)
    
    # Нахождение пика (моды) распределения
    mode_idx = np.argmax(density)
    mode_price = x[mode_idx]
    
    # Расчёт доверительного интервала (95%)
    # Находим точки, где плотность составляет 5% от пика
    threshold = density[mode_idx] * 0.05
    confidence_mask = density >= threshold
    confidence_indices = np.where(confidence_mask)[0]
    
    if len(confidence_indices) > 0:
        ci_low = x[confidence_indices[0]]
        ci_high = x[confidence_indices[-1]]
    else:
        ci_low = mode_price * 0.9
        ci_high = mode_price * 1.1
    
    return mode_price, (ci_low, ci_high)


def calculate_trust_weight(trust_metrics: List[TrustMetric]) -> float:
    """
    Расчёт взвешенного доверия участников сделки
    """
    if not trust_metrics:
        return 0.5  # Нейтральное значение
    
    total_weight = sum(tm.weight for tm in trust_metrics)
    if total_weight == 0:
        return 0.5
    
    weighted_trust = sum(tm.trust_level * tm.weight for tm in trust_metrics) / total_weight
    return weighted_trust


def calculate_context_impact(events: List[ContextEvent]) -> float:
    """
    Расчёт влияния контекстных событий на цену
    """
    if not events:
        return 0.0
    
    # Экспоненциальное затухание влияния старых событий
    impacts = [event.impact_score for event in events]
    avg_impact = np.mean(impacts)
    
    return avg_impact


def calculate_price_dispersion(historical_prices: List[HistoricalPrice]) -> float:
    """
    Расчёт дисперсии цен (мера волатильности рынка)
    """
    if len(historical_prices) < 2:
        return 0.0
    
    prices = [hp.price for hp in historical_prices]
    return float(np.std(prices) / np.mean(prices))  # Коэффициент вариации


# ==================== API Endpoints ====================

@app.get("/")
async def root():
    """Информация о сервисе"""
    return {
        "service": "Art Bank Core Analytics Service",
        "version": "1.0.0",
        "status": "operational",
        "endpoints": [
            "/analytics/calculate_fair_price",
            "/analytics/risk_score",
            "/health"
        ]
    }


@app.get("/health")
async def health_check():
    """Проверка здоровья сервиса"""
    return {"status": "healthy", "service": "analytics"}


@app.post("/analytics/calculate_fair_price", response_model=FairPriceResponse)
async def calculate_fair_price(request: FairPriceRequest):
    """
    Расчёт справедливой цены актива
    
    Алгоритм:
    1. Применяет KDE к историческим ценам аналогичных активов
    2. Учитывает репутацию участников сделки
    3. Корректирует на основе контекстных событий
    4. Возвращает Fair Value, доверительный интервал и оценку риска
    """
    try:
        logger.info(f"Расчёт справедливой цены для актива {request.asset_id}")
        
        # Проверка наличия данных
        if not request.historical_prices:
            raise HTTPException(
                status_code=400,
                detail="Недостаточно исторических данных для расчёта"
            )
        
        # 1. Извлечение цен и весов (схожести)
        prices = [hp.price for hp in request.historical_prices]
        weights = [hp.similarity_score for hp in request.historical_prices]
        
        # 2. Построение KDE
        kde = calculate_kde(prices, weights)
        
        # 3. Определение ценового диапазона
        min_price = min(prices) * 0.5
        max_price = max(prices) * 1.5
        
        # 4. Оценка справедливой цены
        fair_value, confidence_interval = estimate_fair_value(kde, (min_price, max_price))
        
        # 5. Корректировка на основе репутации
        trust_weight = calculate_trust_weight(request.trust_metrics)
        trust_adjustment = 1 + (trust_weight - 0.5) * 0.2  # ±10% в зависимости от репутации
        
        # 6. Корректировка на основе контекстных событий
        context_impact = calculate_context_impact(request.context_events)
        context_adjustment = 1 + context_impact * 0.15  # ±15% в зависимости от событий
        
        # 7. Финальная цена
        adjusted_fair_value = fair_value * trust_adjustment * context_adjustment
        adjusted_ci = (
            confidence_interval[0] * trust_adjustment * context_adjustment,
            confidence_interval[1] * trust_adjustment * context_adjustment
        )
        
        # 8. Расчёт риска
        dispersion = calculate_price_dispersion(request.historical_prices)
        if request.current_price:
            price_deviation = abs(request.current_price - adjusted_fair_value) / adjusted_fair_value
            risk_score = min(1.0, (dispersion + price_deviation) / 2)
        else:
            risk_score = min(1.0, dispersion)
        
        # 9. Формирование обоснования
        reasoning = {
            "base_fair_value": round(fair_value, 2),
            "trust_adjustment": round(trust_adjustment, 3),
            "context_adjustment": round(context_adjustment, 3),
            "confidence_interval": {
                "lower": round(adjusted_ci[0], 2),
                "upper": round(adjusted_ci[1], 2)
            },
            "data_points": len(request.historical_prices),
            "avg_similarity": round(np.mean(weights), 3),
            "price_dispersion": round(dispersion, 3),
            "trust_level": round(trust_weight, 3)
        }
        
        logger.info(f"Расчёт завершён: FV={adjusted_fair_value:.2f}, Risk={risk_score:.3f}")
        
        return FairPriceResponse(
            asset_id=request.asset_id,
            fair_value=round(adjusted_fair_value, 2),
            confidence_interval=adjusted_ci,
            risk_score=round(risk_score, 3),
            reasoning=reasoning
        )
        
    except ValueError as e:
        logger.error(f"Ошибка валидации: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Внутренняя ошибка: {e}")
        raise HTTPException(status_code=500, detail="Ошибка расчёта")


@app.post("/analytics/risk_score", response_model=RiskScoreResponse)
async def calculate_risk_score(request: RiskScoreRequest):
    """
    Расчёт коэффициента риска сделки
    
    Факторы риска:
    - Отклонение цены от справедливой стоимости
    - Ликвидность актива
    - Репутация участников
    """
    try:
        logger.info(f"Расчёт риска для актива {request.asset_id}")
        
        # 1. Отклонение от справедливой цены
        price_deviation = abs(request.price - request.fair_value) / request.fair_value
        price_risk = min(1.0, price_deviation * 2)  # Риск растёт с отклонением
        
        # 2. Риск ликвидности (обратная величина)
        liquidity_risk = 1 - request.liquidity_score
        
        # 3. Риск репутации
        trust_weight = calculate_trust_weight(request.trust_metrics)
        reputation_risk = 1 - trust_weight
        
        # 4. Комбинированный риск (взвешенная сумма)
        risk_factors = {
            "price_deviation_risk": round(price_risk, 3),
            "liquidity_risk": round(liquidity_risk, 3),
            "reputation_risk": round(reputation_risk, 3)
        }
        
        # Веса факторов
        weights = {"price": 0.4, "liquidity": 0.3, "reputation": 0.3}
        
        total_risk = (
            price_risk * weights["price"] +
            liquidity_risk * weights["liquidity"] +
            reputation_risk * weights["reputation"]
        )
        
        # 5. Определение уровня риска
        if total_risk < 0.3:
            risk_level = "low"
        elif total_risk < 0.6:
            risk_level = "medium"
        else:
            risk_level = "high"
        
        logger.info(f"Риск рассчитан: {total_risk:.3f} ({risk_level})")
        
        return RiskScoreResponse(
            asset_id=request.asset_id,
            risk_score=round(total_risk, 3),
            risk_level=risk_level,
            factors=risk_factors
        )
        
    except Exception as e:
        logger.error(f"Ошибка расчёта риска: {e}")
        raise HTTPException(status_code=500, detail="Ошибка расчёта риска")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
