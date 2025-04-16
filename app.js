// 安全提示：请勿在代码中直接暴露API密钥
// 正确做法是使用环境变量或在本地测试后删除
const OKEX_API_KEY = '9f1bba1b-944f-4adf-aeb2-f469328d1c96'; // 测试后请删除或使用环境变量

// 配置参数
const CONFIG = {
    checkInterval: 10000, // 10秒检查一次
    volumePeriod: 20,     // 成交量计算周期
    coins: ['BTC-USDT', 'ETH-USDT'] // 只监控BTC和ETH
};

// 全局变量
let alertSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2593/2593-preview.mp3');
let chart = null;
let currentSymbol = CONFIG.coins[0];

// 初始化函数
async function init() {
    updateCoinCards();
    document.getElementById('start-btn').addEventListener('click', startMonitoring);
    
    // 请求通知权限
    if ('Notification' in window) {
        Notification.requestPermission();
    }
    
    // 默认显示BTC图表
    showChart(currentSymbol);
}

// 更新币种卡片信息
async function updateCoinCards() {
    try {
        const response = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
        const data = await response.json();
        
        CONFIG.coins.forEach(symbol => {
            const coin = data.data.find(item => item.instId === symbol);
            if (coin) {
                const card = document.querySelector(`.coin-card[data-symbol="${symbol}"]`);
                if (card) {
                    const changePercent = (parseFloat(coin.last) / parseFloat(coin.open24h) - 1) * 100;
                    const changeColor = changePercent >= 0 ? '#4CAF50' : '#F44336';
                    
                    card.querySelector('.price').textContent = `价格: ${coin.last}`;
                    card.querySelector('.change').innerHTML = 
                        `24H变化: <span style="color:${changeColor}">${changePercent.toFixed(2)}%</span>`;
                }
            }
        });
    } catch (error) {
        console.error('更新币种信息失败:', error);
    }
}

// 显示K线图表
function showChart(symbol) {
    currentSymbol = symbol;
    const chartContainer = document.getElementById('tv-chart');
    chartContainer.innerHTML = '';
    
    chart = LightweightCharts.createChart(chartContainer, {
        width: chartContainer.clientWidth,
        height: 450,
        layout: {
            backgroundColor: '#252525',
            textColor: '#e0e0e0',
        },
        grid: {
            vertLines: { color: '#444' },
            horzLines: { color: '#444' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        priceScale: {
            borderColor: '#444',
        },
        timeScale: {
            borderColor: '#444',
        },
    });
    
    const candleSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderDownColor: '#ef5350',
        borderUpColor: '#26a69a',
        wickDownColor: '#ef5350',
        wickUpColor: '#26a69a',
    });
    
    // 加载K线数据
    loadChartData(symbol, candleSeries);
}

// 加载图表数据
async function loadChartData(symbol, candleSeries) {
    try {
        const response = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=15m&limit=100`);
        const data = await response.json();
        
        const candles = data.data.map(item => ({
            time: parseInt(item[0]) / 1000,
            open: parseFloat(item[1]),
            high: parseFloat(item[2]),
            low: parseFloat(item[3]),
            close: parseFloat(item[4])
        })).reverse();
        
        candleSeries.setData(candles);
        
        // 添加均线
        addMovingAverages(candles);
    } catch (error) {
        console.error('加载K线数据失败:', error);
    }
}

// 添加均线指标
function addMovingAverages(candles) {
    const closes = candles.map(c => c.close);
    
    // 7周期均线
    const ma7 = calculateMA(closes, 7);
    const ma7Series = chart.addLineSeries({
        color: '#FF9800',
        lineWidth: 2,
    });
    ma7Series.setData(closes.map((_, i) => ({ time: candles[i].time, value: ma7[i] })));
    
    // 14周期均线
    const ma14 = calculateMA(closes, 14);
    const ma14Series = chart.addLineSeries({
        color: '#2196F3',
        lineWidth: 2,
    });
    ma14Series.setData(closes.map((_, i) => ({ time: candles[i].time, value: ma14[i] })));
}

// 开始监控
function startMonitoring() {
    const goldenCrossAlert = document.getElementById('golden-cross-alert').checked;
    const deathCrossAlert = document.getElementById('death-cross-alert').checked;
    const volumeSpikeAlert = document.getElementById('volume-spike-alert').checked;
    const volumeShrinkAlert = document.getElementById('volume-shrink-alert').checked;
    const volumeSpikeRatio = parseFloat(document.getElementById('volume-spike-ratio').value);
    const volumeShrinkRatio = parseFloat(document.getElementById('volume-shrink-ratio').value);
    
    // 清空现有警报
    document.getElementById('alert-container').innerHTML = '';
    
    // 设置定时检查
    setInterval(() => {
        CONFIG.coins.forEach(symbol => {
            checkAlerts(
                symbol, 
                goldenCrossAlert, 
                deathCrossAlert, 
                volumeSpikeAlert, 
                volumeShrinkAlert,
                volumeSpikeRatio,
                volumeShrinkRatio
            );
        });
        updateCoinCards(); // 更新价格信息
    }, CONFIG.checkInterval);
}

// 检查各种警报条件
async function checkAlerts(
    symbol, 
    checkGoldenCross, 
    checkDeathCross, 
    checkVolumeSpike, 
    checkVolumeShrink,
    volumeSpikeRatio,
    volumeShrinkRatio
) {
    try {
        const response = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=1H&limit=50`);
        const klines = await response.json();
        
        if (!klines.data || klines.data.length < CONFIG.volumePeriod + 2) return;
        
        // 准备数据
        const closes = klines.data.map(k => parseFloat(k[4]));
        const highs = klines.data.map(k => parseFloat(k[2]));
        const lows = klines.data.map(k => parseFloat(k[3]));
        const volumes = klines.data.map(k => parseFloat(k[5]));
        
        // MACD计算
        const macdData = calculateMACD(closes);
        
        // 金叉检测
        if (checkGoldenCross && isGoldenCross(macdData.MACD, macdData.signal)) {
            triggerAlert(symbol, 'MACD金叉信号出现!', 'golden-cross');
        }
        
        // 死叉检测
        if (checkDeathCross && isDeathCross(macdData.MACD, macdData.signal)) {
            triggerAlert(symbol, 'MACD死叉信号出现!', 'death-cross');
        }
        
        // 均线交叉检测
        const ma7 = calculateMA(closes, 7);
        const ma14 = calculateMA(closes, 14);
        
        if (checkGoldenCross && isGoldenCross(ma7, ma14)) {
            triggerAlert(symbol, 'MA7上穿MA14金叉!', 'golden-cross');
        }
        
        if (checkDeathCross && isDeathCross(ma7, ma14)) {
            triggerAlert(symbol, 'MA7下穿MA14死叉!', 'death-cross');
        }
        
        // 成交量分析
        const avgVolume = calculateAverageVolume(volumes);
        const currentVolume = volumes[volumes.length - 1];
        const volumeRatio = currentVolume / avgVolume;
        
        // 放量检测
        if (checkVolumeSpike && volumeRatio > volumeSpikeRatio) {
            triggerAlert(symbol, `放量上涨! 量比 ${volumeRatio.toFixed(1)}倍`, 'volume-spike');
        }
        
        // 缩量检测
        if (checkVolumeShrink && volumeRatio < volumeShrinkRatio) {
            triggerAlert(symbol, `缩量下跌! 量比 ${volumeRatio.toFixed(1)}倍`, 'volume-shrink');
        }
    } catch (error) {
        console.error(`检查${symbol}警报失败:`, error);
    }
}

// 触发警报
function triggerAlert(symbol, message, alertType) {
    const alertText = `[${new Date().toLocaleTimeString()}] ${symbol.replace('-', '/')} ${message}`;
    console.log('警报:', alertText);
    
    // 页面显示警报
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert ${alertType}`;
    alertDiv.textContent = alertText;
    document.getElementById('alert-container').prepend(alertDiv);
    
    // 播放声音
    alertSound.play();
    
    // 浏览器通知
    if (Notification.permission === 'granted') {
        new Notification(`📢 ${symbol} 警报`, { body: message });
    }
    
    // 手机震动
    if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
    }
}

// ================= 指标计算函数 =================
function calculateMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const fastEMA = calculateEMA(closes, fastPeriod);
    const slowEMA = calculateEMA(closes, slowPeriod);
    const MACD = fastEMA.map((val, idx) => val - slowEMA[idx]);
    const signal = calculateEMA(MACD, signalPeriod);
    return { MACD, signal };
}

function calculateKDJ(highs, lows, closes, n = 9) {
    const lowestLows = calculateLowest(lows, n);
    const highestHighs = calculateHighest(highs, n);
    
    const RSV = closes.map((close, i) => {
        if (i < n - 1) return 50;
        const ll = lowestLows[i];
        const hh = highestHighs[i];
        return ((close - ll) / (hh - ll)) * 100;
    });
    
    const K = calculateSMA(RSV, 3, 50);
    const D = calculateSMA(K, 3, 50);
    const J = K.map((k, i) => 3 * k - 2 * D[i]);
    
    return { K, D, J };
}

function calculateMA(data, period) {
    return data.map((_, idx) => {
        if (idx < period - 1) return null;
        const sum = data.slice(idx - period + 1, idx + 1).reduce((a, b) => a + b, 0);
        return sum / period;
    }).filter(val => val !== null);
}

function calculateAverageVolume(volumes) {
    const period = Math.min(CONFIG.volumePeriod, volumes.length - 1);
    const recentVolumes = volumes.slice(-period - 1, -1);
    return recentVolumes.reduce((sum, vol) => sum + vol, 0) / period;
}

// ================= 交叉检测函数 =================
function isGoldenCross(line1, line2) {
    if (line1.length < 2 || line2.length < 2) return false;
    const prev1 = line1[line1.length - 2];
    const curr1 = line1[line1.length - 1];
    const prev2 = line2[line2.length - 2];
    const curr2 = line2[line2.length - 1];
    return prev1 < prev2 && curr1 > curr2;
}

function isDeathCross(line1, line2) {
    if (line1.length < 2 || line2.length < 2) return false;
    const prev1 = line1[line1.length - 2];
    const curr1 = line1[line1.length - 1];
    const prev2 = line2[line2.length - 2];
    const curr2 = line2[line2.length - 1];
    return prev1 > prev2 && curr1 < curr2;
}

// ================= 辅助计算函数 =================
function calculateEMA(data, period) {
    const k = 2 / (period + 1);
    const ema = [data[0]];
    for (let i = 1; i < data.length; i++) {
        ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
}

function calculateSMA(data, period, initial = 0) {
    return data.map((_, idx) => {
        if (idx < period - 1) return initial;
        const sum = data.slice(idx - period + 1, idx + 1).reduce((a, b) => a + b, 0);
        return sum / period;
    });
}

function calculateHighest(data, period) {
    return data.map((_, idx) => {
        const start = Math.max(0, idx - period + 1);
        return Math.max(...data.slice(start, idx + 1));
    });
}

function calculateLowest(data, period) {
    return data.map((_, idx) => {
        const start = Math.max(0, idx - period + 1);
        return Math.min(...data.slice(start, idx + 1));
    });
}

// 初始化应用
document.addEventListener('DOMContentLoaded', init);
