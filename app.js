// 配置参数
const CONFIG = {
    checkInterval: 10000, // 10秒检查一次
    volumePeriod: 20,     // 成交量计算周期
    topCoins: 10          // 监控前10大币种
};

// 全局变量
let alertSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2593/2593-preview.mp3');
let chart = null;
let currentSymbol = 'BTC-USDT';

// 初始化函数
async function init() {
    loadCoinList();
    document.getElementById('start-btn').addEventListener('click', startMonitoring);
    
    // 请求通知权限
    if ('Notification' in window) {
        Notification.requestPermission();
    }
}

// 加载币种列表
async function loadCoinList() {
    try {
        const response = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
        const data = await response.json();
        const coins = data.data
            .sort((a, b) => b.vol24h - a.vol24h)
            .slice(0, CONFIG.topCoins);
        
        const container = document.getElementById('coin-container');
        container.innerHTML = '';
        
        coins.forEach(coin => {
            const coinCard = document.createElement('div');
            coinCard.className = 'coin-card';
            coinCard.innerHTML = `
                <strong>${coin.instId.replace('-', '/')}</strong>
                <div>24H量: ${(coin.vol24h/10000).toFixed(1)}万</div>
                <div>最新价: ${coin.last}</div>
            `;
            coinCard.addEventListener('click', () => showChart(coin.instId));
            container.appendChild(coinCard);
        });
        
        // 默认显示第一个币种的图表
        if (coins.length > 0) {
            showChart(coins[0].instId);
        }
    } catch (error) {
        console.error('加载币种列表失败:', error);
    }
}

// 显示K线图表
function showChart(symbol) {
    currentSymbol = symbol;
    const chartContainer = document.getElementById('tv-chart');
    chartContainer.innerHTML = '';
    
    chart = LightweightCharts.createChart(chartContainer, {
        width: chartContainer.clientWidth,
        height: 400,
        layout: {
            backgroundColor: '#ffffff',
            textColor: '#333',
        },
        grid: {
            vertLines: { color: '#eee' },
            horzLines: { color: '#eee' },
        },
    });
    
    const candleSeries = chart.addCandlestickSeries();
    
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
    } catch (error) {
        console.error('加载K线数据失败:', error);
    }
}

// 开始监控
function startMonitoring() {
    const macdAlert = document.getElementById('macd-alert').checked;
    const kdjAlert = document.getElementById('kdj-alert').checked;
    const volumeAlert = document.getElementById('volume-alert').checked;
    const volumeRatio = parseFloat(document.getElementById('volume-ratio').value);
    
    // 清空现有警报
    document.getElementById('alert-container').innerHTML = '';
    
    // 获取监控币种列表
    const coins = Array.from(document.querySelectorAll('.coin-card strong'))
        .map(el => el.textContent.replace('/', '-'));
    
    // 设置定时检查
    setInterval(() => {
        coins.forEach(symbol => {
            checkAlerts(symbol, macdAlert, kdjAlert, volumeAlert, volumeRatio);
        });
    }, CONFIG.checkInterval);
}

// 检查各种警报条件
async function checkAlerts(symbol, checkMACD, checkKDJ, checkVolume, volumeRatio) {
    try {
        const response = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=1H&limit=50`);
        const klines = await response.json();
        
        if (!klines.data || klines.data.length < CONFIG.volumePeriod + 2) return;
        
        // 准备数据
        const closes = klines.data.map(k => parseFloat(k[4]));
        const highs = klines.data.map(k => parseFloat(k[2]));
        const lows = klines.data.map(k => parseFloat(k[3]));
        const volumes = klines.data.map(k => parseFloat(k[5]));
        
        // MACD金叉检测
        if (checkMACD) {
            const macdData = calculateMACD(closes);
            if (isGoldenCross(macdData.MACD, macdData.signal)) {
                triggerAlert(symbol, 'MACD金叉信号出现!');
            }
        }
        
        // KDJ金叉检测
        if (checkKDJ) {
            const kdjData = calculateKDJ(highs, lows, closes);
            if (isGoldenCross(kdjData.K, kdjData.D)) {
                triggerAlert(symbol, 'KDJ金叉信号出现!');
            }
        }
        
        // 放量检测
        if (checkVolume) {
            const avgVolume = calculateAverageVolume(volumes);
            const currentVolume = volumes[volumes.length - 1];
            if (currentVolume > avgVolume * volumeRatio) {
                const ratio = (currentVolume / avgVolume).toFixed(1);
                triggerAlert(symbol, `放量上涨! 量比 ${ratio}倍`);
            }
        }
    } catch (error) {
        console.error(`检查${symbol}警报失败:`, error);
    }
}

// 触发警报
function triggerAlert(symbol, message) {
    const alertText = `[${new Date().toLocaleTimeString()}] ${symbol.replace('-', '/')} ${message}`;
    console.log('警报:', alertText);
    
    // 页面显示警报
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert';
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
    // 简化版MACD计算
    const fastEMA = calculateEMA(closes, fastPeriod);
    const slowEMA = calculateEMA(closes, slowPeriod);
    const MACD = fastEMA.map((val, idx) => val - slowEMA[idx]);
    const signal = calculateEMA(MACD, signalPeriod);
    return { MACD, signal };
}

function calculateKDJ(highs, lows, closes, n = 9) {
    // 简化版KDJ计算
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

function calculateAverageVolume(volumes) {
    const period = Math.min(CONFIG.volumePeriod, volumes.length - 1);
    const recentVolumes = volumes.slice(-period - 1, -1);
    return recentVolumes.reduce((sum, vol) => sum + vol, 0) / period;
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

function isGoldenCross(line1, line2) {
    if (line1.length < 2 || line2.length < 2) return false;
    const prev1 = line1[line1.length - 2];
    const curr1 = line1[line1.length - 1];
    const prev2 = line2[line2.length - 2];
    const curr2 = line2[line2.length - 1];
    return prev1 < prev2 && curr1 > curr2;
}

// 初始化应用
document.addEventListener('DOMContentLoaded', init);
