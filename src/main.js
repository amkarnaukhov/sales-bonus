/**
 * Функция для расчета выручки
 * @param purchase запись о покупке
 * @param _product карточка товара
 * @returns {number}
 */
function calculateSimpleRevenue(purchase, _product) {
    // purchase — это одна из записей в поле items из чека в data.purchase_records
    // _product — это продукт из коллекции data.products

    // @TODO: Расчет выручки от операции

    const { discount = 0, sale_price = 0, quantity = 0 } = purchase;
    const discountFactor = 1 - (discount / 100);

    return sale_price * quantity * discountFactor;
}

/**
 * Функция для расчета бонусов
 * @param index порядковый номер в отсортированном массиве
 * @param total общее число продавцов
 * @param seller карточка продавца
 * @returns {number}
 */
function calculateBonusByProfit(index, total, seller) {

    // Расчет бонуса от позиции в рейтинге
    const profit = Math.max(0, Number(seller.profit ?? 0));

    if (index === 0) {
        // 1-е место
        return profit * 0.15;
    } else if (index === 1 || index === 2) {
        // 2-e и 3-e места
        return profit * 0.10;
    } else if (index === total - 1) {
        // последнее место
        return 0;
    } else {
        // все остальные
        return profit * 0.05;
    }
}

/**
 * Функция для анализа данных продаж
 * @param data
 * @param options
 * @returns {{revenue, top_products, bonus, name, sales_count, profit, seller_id}[]}
 */
function analyzeSalesData(data, options) {

    // Проверка входных данных
    if (!data
        || (!Array.isArray(data.sellers) || !Array.isArray(data.products) || !Array.isArray(data.purchase_records))
        || ((data.sellers.length === 0) || (data.products.length === 0) || (data.purchase_records.length === 0))
    ) {
        throw new Error('Некорректные входные данные');
    }

    // Проверка наличия опций

    if (options == null
        || typeof options !== "object"
    ) {
        throw new Error('Опции должны быть объектом');
    }

    const { calculateRevenue, calculateBonus } = options; // Сюда передадим функции для расчётов

    // Проверка, что новые переменные определены

    if (calculateRevenue === undefined
        || calculateBonus === undefined
    ) {
        throw new Error('Переменные в опциях не определены');
    }

    // Проверка, что переменные являются функциями

    if (typeof calculateRevenue !== "function"
        || typeof calculateBonus !== "function"
    ) {
        throw new Error('Переменные в опциях должны быть функциями');
    }

    // Подготовка промежуточных данных для сбора статистики

    const sellerStats = data.sellers.map(seller => ({
        id: seller.id,
        name: `${seller.first_name} ${seller.last_name}`,
        revenue: 0,
        profit: 0,
        sales_count: 0,
        products_sold: {}
    }));

    // Индексация продавцов и товаров для быстрого доступа

    const sellerIndex = sellerStats.reduce((acc, s) => {
        acc[s.id] = s;
        return acc;
    }, {}); // Ключом будет id, значением — запись из sellerStats

    const productIndex = Object.fromEntries(
        data.products.map(p => [p.sku, p])
    ); // Ключом будет sku, значением — запись из data.products

    // Расчет выручки и прибыли для каждого продавца

    data.purchase_records.forEach(record => { // Чек
        const seller = sellerIndex[record.seller_id]; // Продавец
        if (!seller) return;
        // Увеличить количество продаж 
        seller.sales_count += 1;
        // Увеличить общую сумму всех продаж
        const checkRevenue = Number(record.total_amount ?? 0);
        seller.revenue += checkRevenue;

        // Расчёт прибыли для каждого товара
        record.items.forEach(item => {
            const product = productIndex[item.sku]; // Товар
            if (!product) return;

            // Посчитать себестоимость (cost) товара как product.purchase_price, умноженную на количество товаров из чека
            const qty = Number(item.quantity ?? 0);
            const cost = Number(product.purchase_price) * qty;

            // Посчитать выручку (revenue) с учётом скидки через функцию calculateRevenue
            const revenue = Number(calculateRevenue(item, product)) || 0;

            // Посчитать прибыль: выручка минус себестоимость
            const profit = revenue - cost;

            // Увеличить общую накопленную прибыль (profit) у продавца  
            seller.profit += profit;

            // Учёт количества проданных товаров
            if (!seller.products_sold[item.sku]) {
                seller.products_sold[item.sku] = 0;
            }
            // По артикулу товара увеличить его проданное количество у продавца
            seller.products_sold[item.sku] += qty;
        });
    });

    // Сортировка продавцов по прибыли
    sellerStats.sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0));

    // Назначение премий на основе ранжирования
    sellerStats.forEach((seller, index) => {
        // бонус продавца
        seller.bonus = calculateBonus(index, sellerStats.length, seller);
        // топ-10 проданных товаров
        seller.top_products = Object
            .entries(seller.products_sold)
            .map(([sku, quantity]) => ({ sku, quantity }))
            .sort(((a, b) => b.quantity - a.quantity))
            .slice(0, 10);
    });

    // Подготовка итоговой коллекции с нужными полями

    // Хелпер для округления до 2 знаков и возврата числом
    const to2 = n => +Number(n ?? 0).toFixed(2);

    return sellerStats.map(seller => ({
        seller_id: String(seller.id), // Строка, идентификатор продавца
        name: seller.name, // Строка, имя продавца
        revenue: to2(seller.revenue), // Число с двумя знаками после точки, выручка продавца
        profit: to2(seller.profit), // Число с двумя знаками после точки, прибыль продавца
        sales_count: seller.sales_count, // Целое число, количество продаж продавца
        top_products: seller.top_products, // Массив объектов вида: { "sku": "SKU_008","quantity": 10}, топ-10 товаров продавца
        bonus: to2(seller.bonus), // Число с двумя знаками после точки, бонус продавца
    }));
}