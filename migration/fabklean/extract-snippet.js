(async () => {
  const contextId = 10509;
  const receiver = 'http://127.0.0.1:8765/save';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const send = async (name, data) => {
    const res = await fetch(receiver, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ name, data }),
    });
    if (!res.ok) throw new Error(`Receiver failed for ${name}: ${res.status}`);
  };

  const getJson = async (url) => {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  };

  const payloadFields = [
    'id',
    'orderId',
    'invoiceId',
    'shippingBillDate',
    'dueDate',
    'supplyDate',
    'orderDate',
    'workflowStatus',
    'customerNotes',
    'invoiceStatus',
    'balanceAmount',
    'invoiceTotal',
    'shippingAddress',
    'billingAddress',
    'value0',
    'value1',
    'value2',
    'value3',
    'value4',
    'value5',
    'value6',
    'value7',
    'value8',
    'value9',
    'value10',
    'tags',
    'bankName',
    'consumerInfo.id',
    'consumerInfo.name',
    'consumerInfo.firstName',
    'consumerInfo.phoneNumber',
    'consumerInfo.officePhoneNumber',
    'consumerInfo.uniqueCode',
    'consumerInfo.countryCode',
    'consumerInfo.countryCode2',
    'consumerInfo.taxNumber',
    'consumerInfo.email',
    'consumerInfo.customerNotes',
    'consumerInfo.driverNotes',
    'consumerInfo.ordersDue',
    'consumerInfo.loyaltyPoints',
    'consumerInfo.createdTime',
    'consumerInfo.firstOrderTime',
    'consumerInfo.address1',
    'consumerInfo.address2',
    'consumerInfo.externalKey',
    'consumerInfo.isBatchCustomer',
    'customer.id',
    'customer.name',
    'customer.organizationIds',
    'customer.value1',
    'customer.phoneNumber',
    'customer.gstInNumber',
    'currentTaskNames',
    'deliveryUser',
    'processUser',
    'salesPerson',
    'organization.id',
    'organization.name',
    'organization.phoneNumber',
    'TB_orderItems.id',
    'TB_orderItems.quantity',
    'TB_orderItems.name',
    'TB_orderItems.rate',
    'TB_orderItems.receiveCount',
    'TB_orderItems.shippedItemCount',
    'TB_orderItems.productId',
    'TB_orderItems.value1',
    'TB_orderItems.value5',
    'TB_orderItems.tags',
    'orderItems',
    'paymentItems',
    'reference',
    'transportType',
    'supplyPlace',
    'pcsCount',
    'actualDeliveryDate',
    'actualPickupDate',
    'warehouse.id',
    'warehouse.tags',
    'warehouse.paymentStatus',
    'packs',
    'others',
    'guestData',
    'lockerInfo',
  ].join(',');

  const listUrl = (pageNo, pageSize = 150) =>
    `salesOrders/pageSearching.json?query=&contextId=${contextId}` +
    `&payloadFields=${encodeURIComponent(payloadFields)}` +
    `&orderBy=true&orderByCol=id&pageSize=${pageSize}&pageNo=${pageNo}`;

  window.__fabkleanMigrationStatus = {
    startedAt: new Date().toISOString(),
    phase: 'orders',
    page: 0,
    orders: 0,
    customers: 0,
    errors: [],
  };

  const first = await getJson(listUrl(1));
  await send('orders_page_001', first);

  const totalPages = first.totalPages || 1;
  const orders = [...(first.objectList || [])];
  window.__fabkleanMigrationStatus.totalPages = totalPages;
  window.__fabkleanMigrationStatus.orders = orders.length;
  window.__fabkleanMigrationStatus.page = 1;

  for (let page = 2; page <= totalPages; page += 1) {
    const data = await getJson(listUrl(page));
    await send(`orders_page_${String(page).padStart(3, '0')}`, data);
    orders.push(...(data.objectList || []));
    window.__fabkleanMigrationStatus.page = page;
    window.__fabkleanMigrationStatus.orders = orders.length;
    await sleep(150);
  }

  const seenOrderIds = [...new Set(orders.map((order) => order.id).filter(Boolean))];
  const seenOrderNumbers = [...new Set(orders.map((order) => order.orderId).filter(Boolean))];
  const seenCustomerIds = [...new Set(orders.map((order) => order.consumerInfo?.id).filter(Boolean))];

  await send('orders_index', {
    contextId,
    totalPages,
    listCount: orders.length,
    orderIds: seenOrderIds,
    orderNumbers: seenOrderNumbers,
    customerIds: seenCustomerIds,
  });

  window.__fabkleanMigrationStatus.phase = 'order_details';
  for (let i = 0; i < seenOrderIds.length; i += 1) {
    const id = seenOrderIds[i];
    try {
      const detail = await getJson(`salesOrders/pageSearching.json?query=id:${id}&orderBy=true&orderByCal=id&pageSize=1&contextId=${contextId}`);
      const props = await getJson(`propsItems/searching.json?query=baseOrderId:${id}&contextId=${contextId}`).catch((error) => ({ error: error.message }));
      const flowItems = await getJson(`flowItems/searching.json?query=baseOrderId:${id}&contextId=${contextId}`).catch((error) => ({ error: error.message }));
      await send(`order_detail_${id}`, { detail, props, flowItems });
    } catch (error) {
      window.__fabkleanMigrationStatus.errors.push({ phase: 'order_details', id, error: error.message });
      await send(`order_detail_error_${id}`, { id, error: error.message });
    }
    window.__fabkleanMigrationStatus.detailIndex = i + 1;
    await sleep(100);
  }

  window.__fabkleanMigrationStatus.phase = 'logs';
  for (let i = 0; i < seenOrderNumbers.length; i += 1) {
    const orderNumber = seenOrderNumbers[i];
    try {
      const firstLog = await getJson(`activityEvents/getAllsalesOrdervents.json?pageSize=30&pageNo=1&EntityType=salesOrder&orderId=${encodeURIComponent(orderNumber)}&contextId=${contextId}`);
      const pages = firstLog.totalPages || 1;
      const all = [firstLog];
      for (let page = 2; page <= pages; page += 1) {
        all.push(await getJson(`activityEvents/getAllsalesOrdervents.json?pageSize=30&pageNo=${page}&EntityType=salesOrder&orderId=${encodeURIComponent(orderNumber)}&contextId=${contextId}`));
        await sleep(50);
      }
      await send(`order_logs_${orderNumber}`, all);
    } catch (error) {
      window.__fabkleanMigrationStatus.errors.push({ phase: 'logs', orderNumber, error: error.message });
      await send(`order_logs_error_${orderNumber}`, { orderNumber, error: error.message });
    }
    window.__fabkleanMigrationStatus.logIndex = i + 1;
    await sleep(80);
  }

  window.__fabkleanMigrationStatus.phase = 'customers';
  for (let i = 0; i < seenCustomerIds.length; i += 1) {
    const customerId = seenCustomerIds[i];
    try {
      const data = await getJson(`userInfos/${customerId}/warehouse?contextId=${contextId}`);
      await send(`customer_${customerId}`, data);
    } catch (error) {
      window.__fabkleanMigrationStatus.errors.push({ phase: 'customers', customerId, error: error.message });
      await send(`customer_error_${customerId}`, { customerId, error: error.message });
    }
    window.__fabkleanMigrationStatus.customers = i + 1;
    await sleep(80);
  }

  window.__fabkleanMigrationStatus.phase = 'done';
  window.__fabkleanMigrationStatus.finishedAt = new Date().toISOString();
  await send('migration_status_done', window.__fabkleanMigrationStatus);
})();
