export default {
  pluginMeta: {
    name: 'AR SLAM Localization',
    description: 'อัปโหลดแพ็กเกจสแกน ดูตัวอย่างโมเดล GLB และสร้างฉบับร่างการผูกฉาก',
    groupName: 'เครื่องมือ AR',
  },
  common: {
    loading: 'กำลังโหลด...',
    confirm: 'ยืนยัน',
    cancel: 'ยกเลิก',
    save: 'บันทึก',
    delete: 'ลบ',
    edit: 'แก้ไข',
    add: 'เพิ่ม',
    back: 'กลับ',
    success: 'สำเร็จ',
    failed: 'ล้มเหลว',
    actions: 'การดำเนินการ',
    status: 'สถานะ',
    language: 'ภาษา',
  },
  nav: {
    workbench: 'เวิร์กเบนช์การระบุตำแหน่ง',
    apiDiagnostics: 'การวินิจฉัย API',
  },
  workbench: {
    title: 'เวิร์กเบนช์การระบุตำแหน่ง',
    description: 'อัปโหลดแพ็กเกจสแกน Immersal หรือ Area Target Scanner ดูโมเดล GLB และสร้างฉบับร่างการผูกฉาก',
  },
  handshake: {
    notInIframe: 'ไม่ได้ทำงานใน iframe',
    notInIframeDesc: 'ปลั๊กอินนี้ต้องฝังอยู่ในระบบหลัก การเข้าถึงโดยตรงไม่สามารถดำเนินการแฮนด์เชคได้',
    pageLoaded: 'โหลดหน้าเสร็จแล้ว',
    pluginReady: 'ส่ง PLUGIN_READY แล้ว',
    waitingInit: 'รอ INIT — ไม่มีหน้าต่างหลัก จะไม่มาถึง',
    connecting: 'กำลังเชื่อมต่อกับระบบหลัก...',
    goToDiagnostics: 'ไปยังหน้าการวินิจฉัย API →',
  },
  permission: {
    noPermission: 'คุณไม่มีสิทธิ์ใดๆ สำหรับปลั๊กอินนี้ กรุณาติดต่อผู้ดูแลระบบ',
  },
}
