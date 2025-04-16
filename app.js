// 安全提示：请勿在代码中直接暴露API密钥
// 正确做法是使用环境变量或在本地测试后删除
const OKEX_API_KEY = '9f1bba1b-944f-4adf-aeb2-f469328d1c96'; // 测试后请删除或使用环境变量

// 配置参数
const CONFIG = {
    checkInterval: 1000, // 1秒检查一次
    volumePeriod: 20,    // 成交量计算周期
    coins: ['BTC-USDT', 'ETH-USDT'],
    timeFormat: 'HH:mm:ss',
    maxAlerts: 20,       // 最大显示警报数量
    apiLimit: 30         // API每分钟调用限制
};

// 全局变量
let alertSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2593/2593-preview.mp3');
let chart = null;
let currentSymbol = CONFIG.coins[0];
let lastUpdateTime = null;
let monitoringInterval = null;
let apiCallCount = 0;
let apiLimitResetTime = Date.now() + 60000;

// 初始化函数
async function init() {
    updateCurrentTime();
    setInterval(updateCurrentTime, 50); // 50ms更新一次时间显示
    
    setupCoinCards();
    document.getElementById('start-btn').addEventListener('click', startMonitoring);
    document.getElementById('stop-btn').addEventListener('click', stopMonitoring);
    
    // 请求通知权限
    if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
    
    // 默认显示BTC图表
    showChart(currentSymbol);
}

// 设置币种卡片事件
function setupCoinCards() {
    document.querySelectorAll('.coin-card').forEach(card => {
        card.addEventListener('click', function() {
            document.querySelectorAll('.coin-card').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            showChart(this.dataset.symbol);
        });
    });
    document.querySelector('.coin-card').classList.add('active');
}

// 更新当前时间显示（精确到毫秒）
function updateCurrentTime() {
    const now = new Date();
    const timeStr = formatTime(now, CONFIG.timeFormat) + `.${now.getMilliseconds().toString().padStart(3, '0')}`;
    document.getElementById('current-time').textContent = timeStr;
    
    if (lastUpdateTime) {
        const updateStr = formatTime(lastUpdateTime, CONFIG.timeFormat);
        document.getElementById('last-update').textContent = `上次更新: ${updateStr}`;
    }
}

// 时间格式化函数
function formatTime(date, format) {
    const pad = (n) => n.toString().padStart(2, '0');
    return format
        .replace('YYYY', date.getFullYear())
        .replace('MM', pad(date.getMonth() + 1))
        .replace('DD', pad(date.getDate()))
        .replace('HH', pad(date.getHours()))
        .replace('mm', pad(date.getMinutes()))
        .replace('ss', pad(date.getSeconds()));
}

// 显示K线图表
function showChart(symbol) {
    currentSymbol = symbol;
    const chartContainer = document.getElementById('tv-chart');
    chartContainer.innerHTML = '';
    
    chart = LightweightCharts.createChart(chartContainer, {
        width: chartContainer.clientWidth,
        height: 500,
        layout: {
            backgroundColor: '#1e1e1e',
            textColor: '#e0e0e0',
        },
        grid: {
            vertLines: { color: '#333' },
            horzLines: { color: '#333' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: {
                color: '#666',
                labelBackgroundColor: '#444',
            },
            horzLine: {
                color: '#666',
                labelBackgroundColor: '#444',
            },
        },
        priceScale: {
            borderColor: '#333',
        },
        timeScale: {
            borderColor: '#333',
            timeVisible: true,
            secondsVisible: true,
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
    if (apiCallCount >= CONFIG.apiLimit) {
        const now = Date.now();
        if (now < apiLimitResetTime) {
            console.warn(`API调用已达限制 (${CONFIG.apiLimit}/分钟)，等待重置...`);
            return;
        } else {
            apiCallCount = 0;
            apiLimitResetTime = now + 60000;
        }
    }
    
    try {
        apiCallCount++;
        const response = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=1m&limit=100`);
        const data = await response.json();
        
        if (!data.data) {
            console.error('API返回数据异常:', data);
            return;
        }
        
        const candles = data.data.map(item => ({
            time: parseInt(item[0]) / 1000,
            open: parseFloat(item[1]),
            high: parseFloat(item[2]),
            low: parseFloat(item[3]),
            close: parseFloat(item[4]),
            volume: parseFloat(item[5])
        })).reverse();
        
        candleSeries.setData(candles);
        lastUpdateTime = new Date();
        updateCurrentTime();
        
        // 添加均线
        addMovingAverages(candles);
        
        // 更新币种卡片数据
        updateCoinCard(symbol, candles[candles.length - 1].close);
    } catch (error) {
        console.error('加载K线数据失败:', error);
    }
}

// 添加均线指标
function addMovingAverages(candles) {
    const closes = candles.map(c => c.close);
    
    // 移除旧均线
    chart.removeSeries(chart._series[1]);
    chart.removeSeries(chart._series[1]);
    
    // 7周期均线
    const ma7 = calculateMA(closes, 7);
    const ma7Series = chart.addLineSeries({
        color: '#FF9800',
        lineWidth: 2,
        lineStyle: 0, // 0 = 实线
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
    });
    ma7Series.setData(closes.map((_, i) => ({ time: candles[i].time, value: ma7[i] })));
    
    // 14周期均线
    const ma14 = calculateMA(closes, 14);
    const ma14Series = chart.addLineSeries({
        color: '#2196F3',
        lineWidth: 2,
        lineStyle: 0,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
    });
    ma14Series.setData(closes.map((_, i) => ({ time: candles[i].time, value: ma14[i] })));
}

// 更新币种卡片信息
function updateCoinCard(symbol, price) {
    const card = document.querySelector(`.coin-card[data-symbol="${symbol}"]`);
    if (!card) return;
    
    const priceElement = card.querySelector('.price');
    const changeElement = card.querySelector('.change');
    const volumeElement = card.querySelector('.volume');
    
    // 价格变化动画
    const oldPrice = parseFloat(priceElement.textContent.replace('价格: ', '')) || price;
    const isUp = price > oldPrice;
    
    if (priceElement.textContent !== '价格: -') {
        priceElement.style.color = isUp ? '#4CAF50' : '#F44336';
        setTimeout(() => {
            priceElement.style.color = '#e0e0e0';
        }, 1000);
    }
    
    priceElement.textContent = `价格: ${price.toFixed(2)}`;
    
    // 获取24小时变化数据
    fetch(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}`)
        .then(response => response.json())
        .then(data => {
            if (data.data && data.data[0]) {
                const ticker = data.data[0];
                const changePercent = (parseFloat(ticker.last) / parseFloat(ticker.open24h) - 1) * 100;
                const changeColor = changePercent >= 0 ? '#4CAF50' : '#F44336';
                const changeText = changePercent >= 0 ? `+${changePercent.toFixed(2)}%` : `${changePercent.toFixed(2)}%`;
                
                changeElement.innerHTML = `24H变化: <span style="color:${changeColor}">${changeText}</span>`;
                volumeElement.textContent = `成交量: ${(ticker.vol24h / 1000).toFixed(1)}K`;
            }
        })
        .catch(error => console.error('获取24小时数据失败:', error));
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
    
    // 更新UI状态
    document.getElementById('start-btn').style.display = 'none';
    document.getElementById('stop-btn').style.display = 'block';
    document.getElementById('system-status').innerHTML = 
        '<span class="status-indicator status-active"></span>系统状态: 运行中';
    
    // 立即执行一次检查
    checkAllAlerts();
    
    // 设置定时检查（每秒一次）
    monitoringInterval = setInterval(checkAllAlerts, CONFIG.checkInterval);
    
    function checkAllAlerts() {
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
        
        // 每分钟重置API计数器
        if (Date.now() >= apiLimitResetTime) {
            apiCallCount = 0;
            apiLimitResetTime = Date.now() + 60000;
        }
    }
}

// 停止监控
function stopMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
        
        // 更新UI状态
        document.getElementById('start-btn').style.display = 'block';
        document.getElementById('stop-btn').style.display = 'none';
        document.getElementById('system-status').innerHTML = 
            '<span class="status-indicator status-inactive"></span>系统状态: 已停止';
    }
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
        const response = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=1m&limit=50`);
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
    const now = new Date();
    const timeStr = formatTime(now, 'HH:mm:ss') + `.${now.getMilliseconds().toString().padStart(3, '0')}`;
    const alertText = `[${timeStr}] ${symbol.replace('-', '/')} ${message}`;
    
    // 页面显示警报
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert ${alertType}`;
    alertDiv.textContent = alertText;
    const container = document.getElementById('alert-container');
    container.insertBefore(alertDiv, container.firstChild);
    
    // 保持最多显示警报数量
    const alerts = document.querySelectorAll('#alert-container .alert');
    if (alerts.length > CONFIG.maxAlerts) {
        alerts[alerts.length - 1].remove();
    }
    
    // 播放声音
    alertSound.currentTime = 0;
    alertSound.play().catch(e => console.log('声音播放被阻止:', e));
    
    // 浏览器通知
    if (Notification.permission === 'granted') {
        new Notification(`📢 ${symbol} 警报`, { 
            body: message,
            icon: 'https://static.okx.com/cdn/assets/imgs/2212/7A9BAF6E5D8C1E13.png',
            timestamp: now.getTime()
        });
    }
    
    // 手机震动
    if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
    }
    
    // 币种卡片闪烁提醒
    const card = document.querySelector(`.coin-card[data-symbol="${symbol}"]`);
    if (card) {
        card.style.animation = 'none';
        void card.offsetWidth; // 触发重绘
        card.style.animation = 'flash 1s 2';
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

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
@keyframes flash {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 rgba(33, 150, 243, 0); }
    50% { opacity: 0.7; box-shadow: 0 0 15px rgba(33, 150, 243, 0.7); }
}
`;
document.head.appendChild(style);
