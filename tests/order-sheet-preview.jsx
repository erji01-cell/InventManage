import React from 'react';
import { createRoot } from 'react-dom/client';
import OrderRequestScreen from '../screens/OrderRequestScreen.jsx';
import '../styles.css';

// Isolated print preview with synthetic orders; no production API calls.
const assets = [
  { id: 10, maker: 'オリンパス', name: '生検鉗子 GF用', packSize: 5, usageUnit: '本', purchaseUnit: '箱', supplier: '山下医科器械' },
  { id: '11', maker: '富士フイルム', name: '長い商品名でも折り返せる内視鏡用フィルター D7304-MS2', packSize: 1, usageUnit: '個', purchaseUnit: '個', supplier: '山下医科器械' },
  { id: '12', maker: '他社メーカー', name: '他社の品物', packSize: 2, usageUnit: '本', purchaseUnit: '箱', supplier: '別の取引先' },
  { id: '13', maker: 'テストメーカー', name: 'アトル向け商品', packSize: 10, usageUnit: '個', purchaseUnit: '箱', supplier: 'アトル' },
  { id: '14', maker: 'テストメーカー', name: '旧MVC向け商品', packSize: 1, usageUnit: '本', purchaseUnit: '本', supplier: 'MVC' },
];
const orders = [
  { id: '1', assetId: 10, supplierName: '山下医科器械', assetName: assets[0].name, quantity: 2, purchaseUnit: '箱', requestedAt: '2026-10-07T02:00:00Z', status: 'requested', requestedBy: '担当者A' },
  { id: '2', assetId: '11', supplierName: '山下医科機械', assetName: assets[1].name, quantity: 1, purchaseUnit: '個', requestedAt: '2026-10-07T02:05:00Z', status: 'requested', requestedBy: '担当者A' },
  { id: '3', assetId: '12', supplierName: '別の取引先', assetName: assets[2].name, quantity: 9, purchaseUnit: '箱', requestedAt: '2026-10-07T02:10:00Z', status: 'requested', requestedBy: '担当者A' },
  { id: '4', assetId: '10', supplierName: '山下医科器械', assetName: assets[0].name, quantity: 3, purchaseUnit: '箱', requestedAt: '2026-10-06T02:00:00Z', status: 'requested', requestedBy: '担当者A' },
  { id: '5', assetId: '10', supplierName: '山下医科器械', assetName: assets[0].name, quantity: 4, purchaseUnit: '箱', requestedAt: '2026-10-07T02:00:00Z', status: 'completed', requestedBy: '担当者A' },
  { id: '6', assetId: '13', supplierName: 'アトル', assetName: assets[3].name, quantity: 2, purchaseUnit: '箱', requestedAt: '2026-10-07T02:00:00Z', status: 'requested', requestedBy: '担当者A' },
  { id: '7', assetId: '14', supplierName: 'ＭＶＣ', assetName: assets[4].name, quantity: 3, purchaseUnit: '本', requestedAt: '2026-10-07T02:00:00Z', status: 'requested', requestedBy: '担当者A' },
  { id: '8', assetId: '13', supplierName: 'アトル（旧MVC）', assetName: assets[3].name, quantity: 5, purchaseUnit: '箱', requestedAt: '2026-10-06T02:00:00Z', status: 'requested', requestedBy: '担当者A' },
  { id: '9', assetId: '13', supplierName: '株式会社アトル', assetName: assets[3].name, quantity: 4, purchaseUnit: '箱', requestedAt: '2026-10-07T02:00:00Z', status: 'completed', requestedBy: '担当者A' },
];

createRoot(document.getElementById('root')).render(
  <div className="min-h-screen bg-slate-50 p-4 font-sans md:p-8">
    <OrderRequestScreen
      assets={assets}
      allAssets={assets}
      staff={[{ id: '1', name: '担当者A' }]}
      orders={orders}
      setView={() => {}}
      onCreate={async () => {}}
      onUpdateStatus={async () => {}}
      onUpdateMemo={async () => {}}
      onDelete={async () => {}}
      onRetryEmail={async () => {}}
    />
  </div>,
);
