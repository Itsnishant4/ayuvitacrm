import React, { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Type, 
  Image as ImageIcon, 
  Table as TableIcon, 
  Trash2, 
  Move, 
  Bold, 
  ALargeSmall, 
  Settings2,
  Download,
  Save,
  Plus,
  ChevronRight,
  ChevronLeft,
  Layout,
  X,
  ZoomIn,
  ZoomOut,
  FileText,
  FileUp,
  FileDown,
  Copy
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import toast from 'react-hot-toast';
import * as pdfjs from 'pdfjs-dist';

// Set up pdf.js worker using a more robust Vite-compatible URL
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const DynamicCanvasRow = ({ item, itemIndex, el, children, itemsLength }) => {
  const rowRef = useRef(null);
  const [rowHeight, setRowHeight] = useState(el.rowSpacing);

  useEffect(() => {
    if (rowRef.current) {
      let maxH = el.rowSpacing || 30;
      Array.from(rowRef.current.children).forEach(child => {
        const childHeight = child.scrollHeight || child.offsetHeight || 0;
        if (childHeight > maxH) {
          maxH = childHeight;
        }
      });
      setRowHeight(maxH);
    }
  }, [item, el.rowSpacing, el.fields]);

  return (
    <div
      ref={rowRef}
      className={`relative ${el.showRowBorder ? 'border-b border-muted-foreground/30' : 'border-b border-transparent'} hover:border-muted-foreground/10`}
      style={{
        height: `${rowHeight}px`,
        marginBottom: `${itemIndex === itemsLength - 1 ? 0 : (el.showRowBorder ? 0 : 5)}px`
      }}
    >
      {children}
    </div>
  );
};

const InvoiceDesigner = ({ orderId }) => {
  const [view, setView] = useState('selection'); // 'selection' or 'editor'
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [elements, setElements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [background, setBackground] = useState(null);
  const [bgConfig, setBgConfig] = useState({ x: 0, y: 0, width: 794, height: 1123, opacity: 100 });
  const [canvasSize, setCanvasSize] = useState({ width: 794, height: 1123 }); // A4 at 96 DPI
  const [zoom, setZoom] = useState(0.6); // Default 60% to fit better
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [guides, setGuides] = useState({ x: null, y: null });
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  const fetchTemplates = async () => {
    setIsLoading(true);
    const result = await window.api.getTemplates();
    if (result.success) {
      setTemplates(result.templates);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleExportTemplate = () => {
    try {
      const templateData = { elements, bgConfig, canvasSize, background };
      const blob = new Blob([JSON.stringify(templateData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-template-${Date.now()}.json`;
      link.click();
      toast.success('Template exported successfully');
    } catch (err) {
      toast.error('Failed to export template');
    }
  };

  const handleImportTemplate = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.elements) setElements(data.elements);
        if (data.bgConfig) setBgConfig(data.bgConfig);
        if (data.canvasSize) setCanvasSize(data.canvasSize);
        if (data.background) setBackground(data.background);
        
        toast.success('Template imported successfully');
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        // Use the dialog instead of prompt/confirm
        setSaveName(file.name.replace('.json', ''));
        setIsSaveDialogOpen(true);
      } catch (err) {
        toast.error('Invalid template file');
      }
    };
    reader.readAsText(file);
  };

  const onConfirmSave = async () => {
    if (!saveName) {
      toast.error('Please enter a template name');
      return;
    }

    const templateData = { elements, bgConfig, canvasSize, background };
    const result = await window.api.saveTemplate({ name: saveName, data: templateData });
    if (result.success) {
      toast.success('Template saved to database');
      setIsSaveDialogOpen(false);
      setActiveTemplateId(result.id);
      fetchTemplates();
    } else {
      toast.error('Failed to save template: ' + result.error);
    }
  };

  const handleSaveTemplate = async () => {
    if (activeTemplateId) {
      const templateData = { elements, bgConfig, canvasSize, background };
      const result = await window.api.saveTemplate({ 
        id: activeTemplateId, 
        name: saveName, 
        data: templateData 
      });
      if (result.success) {
        toast.success('Template updated successfully');
        fetchTemplates();
      } else {
        toast.error('Failed to update template: ' + result.error);
      }
    } else {
      setSaveName('');
      setIsSaveDialogOpen(true);
    }
  };

  const handleSaveAsNew = () => {
    setSaveName(saveName ? `${saveName} (Copy)` : 'New Copy');
    setIsSaveDialogOpen(true);
  };

  const handleSelectTemplate = (template) => {
    const data = JSON.parse(template.data);
    setElements(data.elements || []);
    setBgConfig(data.bgConfig || { x: 0, y: 0, width: 794, height: 1123, opacity: 100 });
    setCanvasSize(data.canvasSize || { width: 794, height: 1123 });
    setBackground(data.background || null);
    setActiveTemplateId(template.id);
    setSaveName(template.name || '');
    setView('editor');
  };

  useEffect(() => {
    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY;
        const zoomStep = 0.01;
        setZoom(prev => Math.min(2, Math.max(0.1, prev - delta * zoomStep)));
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (container) container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        deleteElement(selectedId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  const numberToWords = (num) => {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const inWords = (n) => {
      if (n < 20) return a[n];
      if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + a[n % 10] : '');
      if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + inWords(n % 100) : '');
      if (n < 100000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? inWords(n % 1000) : '');
      if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? inWords(n % 100000) : '');
      return '';
    };

    const amount = parseFloat(num) || 0;
    const rupees = Math.floor(amount);
    const paise = Math.round((amount - rupees) * 100);

    let result = inWords(rupees) + 'Rupees ';
    if (paise > 0) result += 'and ' + inWords(paise) + 'Paise ';
    return result + 'Only';
  };

  // Mock dynamic data (in real app, fetch from orderId)
  const [orderData, setOrderData] = useState({
    invoice_number: 'INV-2024-001',
    invoice_date: '2024-04-24',
    bill_to_name: 'John Doe',
    bill_to_address: '123 Main St, Mumbai',
    bill_to_phone: '9988776655',
    total_amount: '₹5000.00',
    subtotal: '₹4600.00',
    gst_amount: '₹400.00',
    shipping_charges: '₹100.00',
    received_amount: '₹2000.00',
    final_amount: '₹3000.00',
    total_in_words: numberToWords(3000),
    referral_name: 'Ravi Kumar',
    referral_phone: '9876543210',
    referral_id: 'REF-001',
    // Individual item placeholders
    item_1_name: 'Product A', item_1_qty: '10', item_1_unit: 'Pcs', item_1_size: 'XL', item_1_price: '100', item_1_total: '1000',
    item_2_name: 'Product B', item_2_qty: '5', item_2_unit: 'Box', item_2_size: 'L', item_2_price: '200', item_2_total: '1000',
    items: [
      { item_name: 'Product A', quantity_string: 'quntity', mrp: 'mrp', price_per_item: 'total', total: 'total amount', unit: 'unite', size: 'XL', batch_id: 'Batch#', hsn_sac: 'HSN/SAC', mfg_date: 'MFG' },
      { item_name: 'Product B', quantity_string: '5', mrp: 1000, price_per_item: 200, total: 1000, unit: 'Box', size: 'L', batch_id: 'B-001', hsn_sac: '1234', mfg_date: '2024-01-01' },
      { item_name: 'Product C', quantity_string: '8', mrp: 1200, price_per_item: 150, total: 1200, unit: 'Pcs', size: 'M', batch_id: 'B-002', hsn_sac: '5678', mfg_date: '2024-02-01' },
    ]
  });

  const addRepeaterElement = () => {
    const centerX = (canvasSize.width / 2) - (pan.x / zoom);
    const centerY = (canvasSize.height / 2) - (pan.y / zoom);

    const newElement = {
      id: Date.now(),
      type: 'repeater',
      x: 50,
      y: centerY,
      rowSpacing: 30,
      containerWidth: 700,
      containerHeight: 400,
      fields: [
        { id: 'sno', name: 'S.No', x: 0, tag: 'sno', width: 40 },
        { id: 'name', name: 'Name', x: 50, tag: 'item_name', width: 180 },
        { id: 'batch', name: 'Batch ID', x: 240, tag: 'batch_id', width: 60 },
        { id: 'hsn', name: 'HSN/SAC', x: 310, tag: 'hsn_sac', width: 60 },
        { id: 'qty', name: 'Qty', x: 380, tag: 'quantity_string', width: 40 },
        { id: 'unit', name: 'Unit', x: 430, tag: 'unit', width: 50 },
        { id: 'size', name: 'Size', x: 490, tag: 'size', width: 50 },
        { id: 'mfg', name: 'MFG', x: 545, tag: 'mfg_date', width: 60 },
        { id: 'price', name: 'Price/Item', x: 610, tag: 'price_per_item', width: 80 },
        { id: 'mrp', name: 'MRP (Total)', x: 700, tag: 'mrp', width: 100 },
        { id: 'total', name: 'Final Total', x: 810, tag: 'total', width: 90 },
      ],
      fontSize: 12,
      fontWeight: 'normal',
      color: '#000000',
      showRowBorder: false,
    };
    setElements([...elements, newElement]);
    setSelectedId(newElement.id);
  };
  const addTextElement = (text = 'New Text', tag = '') => {
    // Calculate center of current view
    const centerX = (canvasSize.width / 2) - (pan.x / zoom);
    const centerY = (canvasSize.height / 2) - (pan.y / zoom);

    const newElement = {
      id: Date.now(),
      type: 'text',
      content: text,
      tag: tag, // e.g., 'invoice_number'
      x: Math.max(20, Math.min(centerX, canvasSize.width - 100)),
      y: Math.max(20, Math.min(centerY, canvasSize.height - 50)),
      fontSize: 16,
      fontWeight: 'normal',
      color: '#000000',
    };
    setElements([...elements, newElement]);
    setSelectedId(newElement.id);
  };

  const addTableElement = () => {
    const centerX = (canvasSize.width / 2) - (pan.x / zoom);
    const centerY = (canvasSize.height / 2) - (pan.y / zoom);

    const newElement = {
      id: Date.now(),
      type: 'table',
      x: Math.max(20, Math.min(centerX - 350, canvasSize.width - 700)),
      y: Math.max(20, Math.min(centerY - 100, canvasSize.height - 200)),
      columns: ['Item', 'Qty', 'MRP', 'Total'],
      fontSize: 12,
    };
    setElements([...elements, newElement]);
    setSelectedId(newElement.id);
  };

  const updateElement = (id, updates) => {
    setElements(elements.map(el => el.id === id ? { ...el, ...updates } : el));
  };

  const deleteElement = (id) => {
    setElements(elements.filter(el => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleBackgroundUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      const loadingToast = toast.loading('Processing PDF...');
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        
        const viewport = page.getViewport({ scale: 2.0 }); // High quality
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport }).promise;
        setBackground(canvas.toDataURL());
        toast.success('PDF loaded as background', { id: loadingToast });
      } catch (err) {
        console.error('PDF Load Error:', err);
        toast.error('Failed to load PDF', { id: loadingToast });
      }
    } else {
      const reader = new FileReader();
      reader.onload = (f) => setBackground(f.target.result);
      reader.readAsDataURL(file);
    }
  };

  const selectedElement = elements.find(el => el.id === selectedId);

  if (view === 'selection') {
    return (
      <div className="flex-1 p-8 bg-zinc-50 dark:bg-zinc-950 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">Invoice Designer</h1>
              <p className="text-lg text-muted-foreground mt-2">Manage your custom templates or start a new high-end design.</p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="lg" onClick={() => fileInputRef.current?.click()} className="gap-2 border-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all">
                <FileUp className="w-5 h-5 text-blue-500" /> Import JSON
              </Button>
              <Button size="lg" onClick={() => {
                setElements([]);
                setBackground(null);
                setBgConfig({ x: 0, y: 0, width: 794, height: 1123, opacity: 100 });
                setActiveTemplateId(null);
                setSaveName('');
                setView('editor');
              }} className="gap-2 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 px-8 transition-all hover:scale-[1.02] active:scale-[0.98]">
                <Plus className="w-5 h-5" /> Create New
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-pulse">
              {[1, 2, 3].map(i => <div key={i} className="aspect-[1/1.4] bg-zinc-200 dark:bg-zinc-800 rounded-2xl shadow-sm" />)}
            </div>
          ) : templates.length === 0 ? (
            <Card className="p-32 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm rounded-3xl">
              <div className="max-w-md mx-auto space-y-6">
                <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-3xl flex items-center justify-center mx-auto rotate-3 shadow-inner">
                  <FileText className="w-12 h-12" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Your design studio is empty</h3>
                  <p className="text-muted-foreground mt-2">Bring your invoices to life. Start with a fresh canvas or import an existing JSON template to begin.</p>
                </div>
                <Button size="lg" variant="secondary" onClick={() => fileInputRef.current?.click()} className="gap-2 rounded-xl">
                   <FileUp className="w-4 h-4" /> Import First Template
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {templates.map(template => (
                <Card key={template.id} className="group overflow-hidden border-0 bg-white dark:bg-zinc-900 shadow-xl shadow-zinc-200/50 dark:shadow-none transition-all duration-500 hover:translate-y-[-8px] cursor-pointer rounded-2xl ring-1 ring-zinc-200 dark:ring-zinc-800" onClick={() => handleSelectTemplate(template)}>
                  <div className="aspect-[1/0.7] bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden group-hover:shadow-2xl transition-all">
                    {/* Template Canvas Preview Sim */}
                    <div className="absolute inset-0 p-6 flex flex-col gap-2 opacity-20 scale-75 group-hover:scale-90 group-hover:opacity-30 transition-all duration-700">
                      <div className="w-1/3 h-4 bg-zinc-400 rounded" />
                      <div className="w-2/3 h-4 bg-zinc-300 rounded" />
                      <div className="mt-8 flex justify-between border-b border-zinc-300 pb-2">
                        <div className="w-12 h-3 bg-zinc-400 rounded" />
                        <div className="w-8 h-3 bg-zinc-300 rounded" />
                      </div>
                      {[1,2,3,4].map(i => (
                        <div key={i} className="flex justify-between py-1">
                          <div className="w-20 h-2 bg-zinc-300 rounded" />
                          <div className="w-8 h-2 bg-zinc-400 rounded" />
                        </div>
                      ))}
                      <div className="mt-auto w-full h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                        <div className="w-1/2 h-2 bg-blue-600 rounded-full" />
                      </div>
                    </div>
                    
                    {template.preview_image && (
                      <img src={template.preview_image} className="w-full h-full object-cover relative z-10" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6 z-20">
                      <Button variant="secondary" className="w-full font-bold rounded-xl shadow-xl">Edit Template</Button>
                    </div>
                  </div>
                  <div className="p-5 flex justify-between items-center bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="space-y-1">
                      <p className="font-bold text-zinc-900 dark:text-zinc-100 truncate w-40">{template.name}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{new Date(template.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all rounded-full h-10 w-10 shadow-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Are you sure you want to delete this template?')) {
                          window.api.deleteTemplate(template.id).then(() => fetchTemplates());
                        }
                      }}
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".json" 
          onChange={handleImportTemplate} 
        />
        
        {/* Render Dialog even in selection view */}
        <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl">Import to Studio</DialogTitle>
              <DialogDescription>
                We've loaded your template. Give it a name to permanently store it in your collection.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6">
              <Label htmlFor="name" className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Template Label</Label>
              <Input 
                id="name" 
                value={saveName} 
                onChange={(e) => setSaveName(e.target.value)} 
                placeholder="e.g. Master Billing Template"
                className="mt-2 h-12 rounded-xl border-2 focus-visible:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onConfirmSave();
                }}
              />
            </div>
            <DialogFooter className="sm:justify-between gap-2">
              <Button variant="ghost" onClick={() => setIsSaveDialogOpen(false)} className="rounded-xl">Discard</Button>
              <Button onClick={onConfirmSave} className="bg-blue-600 hover:bg-blue-700 px-8 rounded-xl shadow-lg shadow-blue-500/20">Save to Collection</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950 overflow-hidden font-sans">
      {/* Header */}
      <header className="h-16 border-b bg-background/80 backdrop-blur-md flex items-center justify-between px-6 z-50 sticky top-0 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setView('selection')}>
            <X className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Designing Invoice</h2>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Workspace / Template Editor</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-1 bg-muted rounded-md p-1 mr-4">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(Math.max(0.2, zoom - 0.1))}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs font-medium w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(Math.min(2, zoom + 0.1))}>
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <FileText className="w-4 h-4" /> Template Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleSaveTemplate} className="gap-2">
                <Save className="w-4 h-4" /> Save Template
              </DropdownMenuItem>
              {activeTemplateId && (
                <DropdownMenuItem onClick={handleSaveAsNew} className="gap-2">
                  <Copy className="w-4 h-4" /> Save As New
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleExportTemplate} className="gap-2">
                <FileDown className="w-4 h-4" /> Export (.json)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="gap-2">
                <FileUp className="w-4 h-4" /> Import (.json)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Hidden File Input for Import */}
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".json" 
            onChange={handleImportTemplate} 
          />

          <Button className="gap-2">
            <Download className="w-4 h-4" /> Export PDF
          </Button>
        </div>
      </header>

      <main className="flex-1 flex gap-6 overflow-hidden p-6">
        {/* Sidebar: Controls */}
        <Card className="w-80 flex flex-col shadow-sm border max-h-[calc(100vh-150px)] overflow-hidden">
          <Tabs defaultValue="elements" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid grid-cols-4 rounded-none border-b h-12 flex-shrink-0">
              <TabsTrigger value="elements" className="gap-2 text-xs"><Plus className="w-3 h-3" /> Add</TabsTrigger>
              <TabsTrigger value="layers" className="gap-2 text-xs"><Layout className="w-3 h-3" /> Layers</TabsTrigger>
              <TabsTrigger value="page" className="gap-2 text-xs"><FileText className="w-3 h-3" /> Page</TabsTrigger>
              <TabsTrigger value="style" className="gap-2 text-xs"><Settings2 className="w-3 h-3" /> Style</TabsTrigger>
            </TabsList>
            
            <TabsContent value="elements" className="p-4 space-y-6 overflow-y-auto flex-1 h-full">
              <div className="space-y-3">
                <Label className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Base Elements</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="flex-col h-20 gap-2 text-[10px]" onClick={() => addTextElement()}>
                    <Type className="w-5 h-5" /> Plain Text
                  </Button>
                  <Button variant="outline" className="flex-col h-20 gap-2 text-[10px]" onClick={() => addRepeaterElement()}>
                    <Layout className="w-5 h-5 text-purple-500" /> Dynamic Item Row
                  </Button>
                  <label className="flex flex-col items-center justify-center h-20 gap-2 text-[10px] border rounded-md cursor-pointer hover:bg-muted border-dashed bg-muted/20">
                    <ImageIcon className="w-5 h-5 text-primary" />
                    <span className="font-bold uppercase text-center px-1">Upload Bill (IMG / PDF)</span>
                    <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleBackgroundUpload} />
                  </label>
                  <Button variant="outline" className="flex-col h-20 gap-2 text-[10px] text-red-500" onClick={() => {
                    if(confirm('Clear all elements and background?')) {
                      setElements([]);
                      setBackground(null);
                    }
                  }}>
                    <Trash2 className="w-5 h-5" /> Clear All
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Bill Header & Totals</Label>
                  <div className="grid grid-cols-1 gap-1">
                    {[
                      { name: 'Invoice Number', tag: '{invoice_number}' },
                      { name: 'Invoice Date', tag: '{invoice_date}' },
                      { name: 'Customer Name', tag: '{bill_to_name}' },
                      { name: 'Customer Address', tag: '{bill_to_address}' },
                      { name: 'Customer Phone', tag: '{bill_to_phone}' },
                      { name: 'Referral Name', tag: '{referral_name}' },
                      { name: 'Referral Phone', tag: '{referral_phone}' },
                      { name: 'Referral ID / Ref No', tag: '{referral_id}' },
                      { name: 'Total Amount', tag: '{total_amount}' },
                      { name: 'Subtotal', tag: '{subtotal}' },
                      { name: 'GST Amount', tag: '{gst_amount}' },
                      { name: 'Shipping', tag: '{shipping_charges}' },
                      { name: 'Received', tag: '{received_amount}' },
                      { name: 'Balance Due', tag: '{final_amount}' },
                      { name: 'Total in Words', tag: '{total_in_words}' },
                    ].map(field => (
                      <Button 
                        key={field.tag}
                        variant="ghost" 
                        className="justify-start gap-3 h-8 bg-muted/30 border border-transparent hover:border-primary/20 text-xs"
                        onClick={() => addTextElement(field.name, field.tag)}
                      >
                        <Plus className="w-3 h-3 text-primary" />
                        <span>{field.name}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            </TabsContent>

            <TabsContent value="page" className="p-4 space-y-6 overflow-y-auto h-full">
              <div className="space-y-4">
                <Label className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Canvas Size (A4)</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Width (px)</Label>
                    <Input type="number" value={canvasSize.width} onChange={(e) => setCanvasSize({...canvasSize, width: parseInt(e.target.value)})} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Height (px)</Label>
                    <Input type="number" value={canvasSize.height} onChange={(e) => setCanvasSize({...canvasSize, height: parseInt(e.target.value)})} />
                  </div>
                </div>
              </div>

              {background && (
                <div className="space-y-4 border-t pt-4">
                  <Label className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Background Template</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">X Position</Label>
                      <Input type="number" value={bgConfig.x} onChange={(e) => setBgConfig({...bgConfig, x: parseInt(e.target.value)})} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Y Position</Label>
                      <Input type="number" value={bgConfig.y} onChange={(e) => setBgConfig({...bgConfig, y: parseInt(e.target.value)})} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Width (px)</Label>
                      <Input type="number" value={bgConfig.width} onChange={(e) => setBgConfig({...bgConfig, width: parseInt(e.target.value)})} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Height (px)</Label>
                      <Input type="number" value={bgConfig.height} onChange={(e) => setBgConfig({...bgConfig, height: parseInt(e.target.value)})} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">Opacity</Label>
                      <span className="text-xs">{bgConfig.opacity}%</span>
                    </div>
                    <input 
                      type="range"
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      value={bgConfig.opacity} 
                      onChange={(e) => setBgConfig({...bgConfig, opacity: parseInt(e.target.value)})} 
                      max={100} 
                      step={1} 
                    />
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="layers" className="p-4 flex-1 overflow-y-auto h-full">
              <div className="space-y-2">
                {elements.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">No elements added yet.</p>
                ) : (
                  elements.map(el => (
                    <div 
                      key={el.id}
                      className={`flex items-center justify-between p-2 rounded border text-xs cursor-pointer ${selectedId === el.id ? 'bg-primary/10 border-primary' : 'hover:bg-muted'}`}
                      onClick={() => setSelectedId(el.id)}
                    >
                      <div className="flex items-center gap-2">
                        {el.type === 'text' ? <Type className="w-3 h-3" /> : <TableIcon className="w-3 h-3" />}
                        <span className="truncate w-32">{el.tag || el.content || 'Table'}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={(e) => {
                        e.stopPropagation();
                        deleteElement(el.id);
                      }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="style" className="p-4 space-y-6 flex-1 overflow-y-auto h-full">
              {!selectedElement ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="p-4 bg-muted rounded-full">
                    <Move className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">Select an element on the canvas to edit its style.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">Text Properties</Label>
                    <div className="space-y-4">
                      {selectedElement.type === 'text' && (
                        <div className="space-y-2">
                          <Label className="text-sm">Content</Label>
                          <Input 
                            value={selectedElement.content} 
                            onChange={(e) => updateElement(selectedId, { content: e.target.value })}
                            disabled={!!selectedElement.tag}
                          />
                        </div>
                      )}
                      
                      <div className="flex items-center gap-4">
                        <div className="flex-1 space-y-2">
                          <Label className="text-sm">Size</Label>
                          <div className="flex items-center gap-2">
                            <Input 
                              type="number" 
                              value={selectedElement.fontSize} 
                              onChange={(e) => updateElement(selectedId, { fontSize: parseInt(e.target.value) })}
                            />
                            <ALargeSmall className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Style</Label>
                          <Button 
                            variant={selectedElement.fontWeight === 'bold' ? 'default' : 'outline'}
                            size="icon"
                            onClick={() => updateElement(selectedId, { fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold' })}
                          >
                            <Bold className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm">Color</Label>
                        <div className="flex gap-2">
                          <Input 
                            type="color" 
                            className="w-12 h-10 p-1" 
                            value={selectedElement.color}
                            onChange={(e) => updateElement(selectedId, { color: e.target.value })}
                          />
                          <Input 
                            value={selectedElement.color}
                            onChange={(e) => updateElement(selectedId, { color: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">Position</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">X Position</Label>
                        <Input 
                          type="number" 
                          value={selectedElement.x} 
                          onChange={(e) => updateElement(selectedId, { x: parseInt(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Y Position</Label>
                        <Input 
                          type="number" 
                          value={selectedElement.y} 
                          onChange={(e) => updateElement(selectedId, { y: parseInt(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>

                  {selectedElement.type === 'repeater' && (
                    <div className="space-y-4 border-t pt-4">
                      <Label className="text-xs uppercase font-bold text-muted-foreground">Repeater Settings</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">Table Width</Label>
                          <Input 
                            type="number" 
                            value={selectedElement.containerWidth} 
                            onChange={(e) => updateElement(selectedId, { containerWidth: parseInt(e.target.value) })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">Table Height</Label>
                          <Input 
                            type="number" 
                            value={selectedElement.containerHeight} 
                            onChange={(e) => updateElement(selectedId, { containerHeight: parseInt(e.target.value) })}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Row Spacing (Vertical)</Label>
                        <Input 
                          type="number" 
                          value={selectedElement.rowSpacing} 
                          onChange={(e) => updateElement(selectedId, { rowSpacing: parseInt(e.target.value) })}
                        />
                      </div>
                      <div className="flex items-center justify-between border-t pt-4">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">Show Row Borders</Label>
                          <p className="text-[10px] text-muted-foreground italic">Horizontal line between items</p>
                        </div>
                        <Switch 
                          checked={selectedElement.showRowBorder || false}
                          onCheckedChange={(checked) => updateElement(selectedId, { showRowBorder: checked })}
                        />
                      </div>
                      <div className="space-y-3">
                        <Label className="text-sm text-muted-foreground font-medium">Column Widths</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {selectedElement.fields.map(field => (
                            <div key={field.id} className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">{field.name}</Label>
                              <Input 
                                type="number" 
                                className="h-7 text-xs"
                                value={field.width} 
                                onChange={(e) => {
                                  const newFields = selectedElement.fields.map(f => 
                                    f.id === field.id ? { ...f, width: parseInt(e.target.value) || 0 } : f
                                  );
                                  updateElement(selectedId, { fields: newFields });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <Button variant="destructive" className="w-full gap-2" onClick={() => deleteElement(selectedId)}>
                    <Trash2 className="w-4 h-4" /> Delete Element
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </Card>

        {/* Canvas Area */}
        <div 
          className="flex-1 bg-zinc-100 dark:bg-zinc-950 rounded-xl border border-dashed flex items-center justify-center p-12 overflow-hidden cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => {
            if (e.target.closest('.draggable-element')) return;
            const startX = e.clientX - pan.x;
            const startY = e.clientY - pan.y;

            const onMouseMove = (moveEvent) => {
              setPan({
                x: moveEvent.clientX - startX,
                y: moveEvent.clientY - startY
              });
            };

            const onMouseUp = () => {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          }}
        >
          <div 
            ref={canvasRef}
            className="bg-white shadow-[0_20px_50px_rgba(0,0,0,0.1)] relative transition-all duration-300 overflow-hidden border origin-center"
            style={{ 
              width: `${canvasSize.width}px`, 
              height: `${canvasSize.height}px`,
              minWidth: `${canvasSize.width}px`,
              minHeight: `${canvasSize.height}px`,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
            onClick={() => setSelectedId(null)}
          >
            {/* Background Layer */}
            {background && (
              <img 
                src={background} 
                className="absolute pointer-events-none z-0" 
                style={{ 
                  left: `${bgConfig.x}px`,
                  top: `${bgConfig.y}px`,
                  width: `${bgConfig.width}px`,
                  height: `${bgConfig.height}px`,
                  opacity: bgConfig.opacity / 100,
                  objectFit: 'fill'
                }}
              />
            )}

            {/* Alignment Guides */}
            {guides.x !== null && (
              <div 
                className="absolute top-0 bottom-0 border-l border-primary border-dashed z-40 pointer-events-none" 
                style={{ left: `${guides.x}px` }} 
              />
            )}
            {guides.y !== null && (
              <div 
                className="absolute left-0 right-0 border-t border-primary border-dashed z-40 pointer-events-none" 
                style={{ top: `${guides.y}px` }} 
              />
            )}

            {/* Elements Layer */}
            <div className="absolute inset-0 z-10">
              {elements.map(el => (
                <div
                  key={el.id}
                  className={`draggable-element absolute cursor-move select-none p-1 border-2 border-transparent hover:border-primary/30 transition-all ${selectedId === el.id ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : ''}`}
                  style={{ 
                    left: `${el.x}px`, 
                    top: `${el.y}px`,
                    zIndex: selectedId === el.id ? 50 : 10
                  }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(el.id);
                }}
                onMouseDown={(e) => {
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const initialX = el.x;
                  const initialY = el.y;

                  const onMouseMove = (moveEvent) => {
                    const dx = (moveEvent.clientX - startX) / zoom;
                    const dy = (moveEvent.clientY - startY) / zoom;
                    let newX = initialX + dx;
                    let newY = initialY + dy;

                    // Snap to 5px
                    newX = Math.round(newX / 5) * 5;
                    newY = Math.round(newY / 5) * 5;

                    // Calculate guides
                    let guideX = null;
                    let guideY = null;
                    
                    elements.forEach(other => {
                      if (other.id === el.id) return;
                      // Vertical alignment
                      if (Math.abs(newX - other.x) < 10) {
                        newX = other.x;
                        guideX = newX;
                      }
                      // Horizontal alignment
                      if (Math.abs(newY - other.y) < 10) {
                        newY = other.y;
                        guideY = newY;
                      }
                    });

                    setGuides({ x: guideX, y: guideY });
                    updateElement(el.id, { x: newX, y: newY });
                  };

                  const onMouseUp = () => {
                    setGuides({ x: null, y: null });
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                  };

                  document.addEventListener('mousemove', onMouseMove);
                  document.addEventListener('mouseup', onMouseUp);
                }}
              >
                {selectedId === el.id && (
                  <button 
                    className="absolute -top-6 -right-6 bg-red-500 text-white p-1 rounded-full shadow-lg hover:bg-red-600 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteElement(el.id);
                    }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                {el.type === 'text' && (
                  <div style={{ 
                    fontSize: `${el.fontSize}px`, 
                    fontWeight: el.fontWeight,
                    color: el.color
                  }}>
                    {el.tag ? orderData[el.tag.replace(/[{}]/g, '')] || el.content : el.content}
                  </div>
                )}
                {el.type === 'repeater' && (
                  <div 
                    className="relative border border-dashed border-muted-foreground/10" 
                    style={{ 
                      fontSize: `${el.fontSize}px`, 
                      color: el.color,
                      width: `${el.containerWidth}px`,
                      minHeight: `${el.containerHeight}px`
                    }}
                  >
                    {orderData.items.map((item, itemIndex) => (
                      <DynamicCanvasRow
                        key={itemIndex}
                        item={item}
                        itemIndex={itemIndex}
                        el={el}
                        itemsLength={orderData.items.length}
                      >
                        {el.fields.map(field => (
                          <div 
                            key={field.id}
                            className="absolute whitespace-normal break-all overflow-hidden border-l border-r border-dashed border-muted-foreground/20 px-1"
                            style={{ 
                              left: `${field.x}px`,
                              width: `${field.width}px`,
                              fontWeight: el.fontWeight,
                              display: 'flex',
                              alignItems: 'center',
                              lineHeight: '1.1',
                              height: '100%'
                            }}
                            onMouseDown={(e) => {
                              if (itemIndex > 0) return; // Only drag template row
                              e.stopPropagation();
                              const startX = e.clientX;
                              const initialFieldX = field.x;
                              
                              const onMouseMove = (m) => {
                                const dx = (m.clientX - startX) / zoom;
                                const newFields = el.fields.map(f => 
                                  f.id === field.id ? { ...f, x: Math.round((initialFieldX + dx) / 5) * 5 } : f
                                );
                                updateElement(el.id, { fields: newFields });
                              };
                              
                              const onMouseUp = () => {
                                document.removeEventListener('mousemove', onMouseMove);
                                document.removeEventListener('mouseup', onMouseUp);
                              };
                              
                              document.addEventListener('mousemove', onMouseMove);
                              document.addEventListener('mouseup', onMouseUp);
                            }}
                          >
                            {field.tag === 'sno' ? itemIndex + 1 : item[field.tag]}
                          </div>
                        ))}
                      </DynamicCanvasRow>
                    ))}
                  </div>
                )}
              </div>
            ))}
            </div>
          </div>
        </div>
      </main>

      {/* Hidden File Input for Import */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".json" 
        onChange={handleImportTemplate} 
      />
      {/* Save Template Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Template</DialogTitle>
            <DialogDescription>
              Enter a name for this template to save it to the database.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="name" className="text-right">Template Name</Label>
            <Input 
              id="name" 
              value={saveName} 
              onChange={(e) => setSaveName(e.target.value)} 
              placeholder="e.g. Retail Invoice Standard"
              className="mt-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirmSave();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={onConfirmSave}>Save Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoiceDesigner;
