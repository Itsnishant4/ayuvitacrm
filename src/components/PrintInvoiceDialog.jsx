import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Printer, FileText, Loader2, Check } from "lucide-react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const numberToWords = (num) => {
  if (num === 0) return 'Zero Only';
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  const convert = (n) => {
    if (n < 10) return units[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + units[n % 10] : '');
    if (n < 1000) return units[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convert(n % 100) : '');
    return '';
  };

  const amount = Math.floor(num);
  const paisa = Math.round((num - amount) * 100);
  
  let res = '';
  if (amount >= 10000000) {
    res += convert(Math.floor(amount / 10000000)) + ' Crore ';
  }
  const lakh = Math.floor((amount % 10000000) / 100000);
  if (lakh > 0) res += convert(lakh) + ' Lakh ';
  const thousand = Math.floor((amount % 100000) / 1000);
  if (thousand > 0) res += convert(thousand) + ' Thousand ';
  const remaining = amount % 1000;
  if (remaining > 0) res += convert(remaining);
  
  res = res.trim() + ' Rupees';
  if (paisa > 0) res += ' and ' + convert(paisa) + ' Paisa';
  return res + ' Only';
};

const PrintInvoiceDialog = ({ isOpen, onClose, onOpenChange, order, orderData }) => {
  const activeOrderData = order || orderData;
  const handleOpenChange = (open) => {
    if (!open) {
      if (onClose) onClose();
      if (onOpenChange) onOpenChange(false);
    }
  };

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const [fullOrderData, setFullOrderData] = useState(null);

  useEffect(() => {
    if (isOpen && activeOrderData) {
      fetchTemplates();
      prepareOrderData();
    }
  }, [isOpen, activeOrderData]);

  const prepareOrderData = async () => {
    if (!activeOrderData) return;
    
    let orderInfo = { ...activeOrderData };
    
    // If referral_code is missing but we have an order ID, fetch the full order from DB
    if (!orderInfo.referral_code && orderInfo.id) {
      const orderRes = await window.api.getOrder(orderInfo.id);
      if (orderRes.success && orderRes.order) {
        orderInfo = { ...orderInfo, ...orderRes.order };
      }
    }
    
    // If activeOrderData already has items (from AddOrder success), use it
    if (orderInfo.items) {
      setFullOrderData(orderInfo);
      return;
    }

    // Otherwise fetch items (from ManageOrders)
    const result = await window.api.getOrderItems(orderInfo.id);
    if (result.success) {
      setFullOrderData({
        ...orderInfo,
        items: result.items.map(item => {
          const qty = item.quantity_string?.split('+').reduce((a, b) => (parseFloat(a) || 0) + (parseFloat(b) || 0), 0) || 0;
          return {
            ...item,
            quantity: qty,
            // Prioritize DB fields, fallback to calculation
            unit: item.unit || '',
            size: item.size || '',
            price_per_item: item.price_per_item || item.mrp || 0,
            total: item.total || (qty * (item.mrp || 0))
          };
        })
      });
    }
  };

  const fetchTemplates = async () => {
    setIsLoading(true);
    const result = await window.api.getTemplates();
    if (result.success) {
      setTemplates(result.templates);
      if (result.templates.length > 0) {
        const defaultTemplate = result.templates.find(t => t.is_default === 1);
        setSelectedTemplateId(defaultTemplate ? defaultTemplate.id : result.templates[0].id);
      }
    }
    setIsLoading(false);
  };

  const handlePrint = async () => {
    if (!selectedTemplateId) {
      toast.error("Please select a template");
      return;
    }

    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) return;

    setIsPrinting(true);
    const loadingToast = toast.loading("Generating PDF...");

    try {
      const templateData = JSON.parse(template.data);
      const dataToUse = { ...(fullOrderData || activeOrderData) };

      if (!dataToUse || !dataToUse.items) {
        throw new Error("Order items not loaded");
      }

      // Pre-calculate subtotal and words
      const itemsTotal = dataToUse.items.reduce((acc, item) => acc + (item.total || 0), 0);
      const shipping = parseFloat(dataToUse.shipping_charges || 0);
      const subtotalVal = itemsTotal + shipping;
      
      dataToUse.subtotal = `₹${subtotalVal.toFixed(2)}`;
      dataToUse.total_amount_string = `₹${(dataToUse.total_amount || 0).toFixed(2)}`;
      dataToUse.final_amount_string = `₹${(dataToUse.final_amount || 0).toFixed(2)}`;
      dataToUse.received_amount_string = `₹${(dataToUse.received_amount || 0).toFixed(2)}`;
      dataToUse.shipping_charges_string = `₹${shipping.toFixed(2)}`;
      dataToUse.gst_amount_string = `₹${(dataToUse.gst_amount || 0).toFixed(2)}`;
      dataToUse.total_in_words = numberToWords(dataToUse.final_amount || 0);

      // Create a hidden wrapper with all: initial to prevent inheritance
      const wrapper = document.createElement('div');
      wrapper.id = "print-wrapper";
      wrapper.style.all = 'initial'; // Reset everything
      wrapper.style.position = 'absolute';
      wrapper.style.left = '-9999px';
      wrapper.style.top = '0';
      wrapper.style.zIndex = '-1000';
      document.body.appendChild(wrapper);

      // Create a hidden container for rendering
      const renderContainer = document.createElement('div');
      renderContainer.id = "print-render-container";
      renderContainer.style.position = 'relative';
      renderContainer.style.width = `${templateData.canvasSize.width}px`;
      renderContainer.style.height = `${templateData.canvasSize.height}px`;
      renderContainer.style.backgroundColor = '#ffffff';
      renderContainer.style.color = '#000000';
      renderContainer.style.fontFamily = 'sans-serif';
      wrapper.appendChild(renderContainer);

      // Add Background if exists
      if (templateData.background) {
        const bgImg = document.createElement('img');
        bgImg.src = templateData.background;
        bgImg.style.position = 'absolute';
        bgImg.style.left = `${templateData.bgConfig.x}px`;
        bgImg.style.top = `${templateData.bgConfig.y}px`;
        bgImg.style.width = `${templateData.bgConfig.width}px`;
        bgImg.style.height = `${templateData.bgConfig.height}px`;
        bgImg.style.opacity = templateData.bgConfig.opacity / 100;
        bgImg.style.zIndex = '0';
        renderContainer.appendChild(bgImg);
      }

      // Helper to ensure colors are safe for html2canvas
      const safeColor = (color) => {
        if (!color) return '#000000';
        const str = String(color).toLowerCase();
        if (str.includes('oklch') || str.includes('var(')) return '#000000';
        return color;
      };

      // Add Elements
      templateData.elements.forEach(el => {
        const elDiv = document.createElement('div');
        elDiv.style.position = 'absolute';
        // Add 10px margin-left to text, 5px to repeater
        const xPos = el.type === 'repeater' ? (el.x + 5) : (el.x + 10);
        elDiv.style.left = `${xPos}px`;
        const yPos = el.type === 'repeater' ? el.y : (el.y + 3);
        elDiv.style.top = `${yPos}px`;
        elDiv.style.zIndex = '10';
        elDiv.style.fontSize = `${el.fontSize}px`;
        elDiv.style.fontWeight = el.fontWeight;
        elDiv.style.color = safeColor(el.color);

        renderContainer.appendChild(elDiv);

        if (el.type === 'text') {
          let content = el.content;
          if (el.tag) {
            const tagName = el.tag.replace(/[{}]/g, '').trim();
            // Mapping for special fields
            const specialTags = {
              'total_amount': 'total_amount_string',
              'final_amount': 'final_amount_string',
              'received_amount': 'received_amount_string',
              'shipping_charges': 'shipping_charges_string',
              'gst_amount': 'gst_amount_string',
              'referral_id': 'referral_code',
              'referral': 'referral_code',
              'date': 'invoice_date'
            };
            const mappedTag = specialTags[tagName] || tagName;
            content = dataToUse[mappedTag] || '';

            // Format date properly to exclude time
            if ((tagName === 'invoice_date' || tagName === 'date') && content) {
              try {
                const dateObj = new Date(content);
                if (!isNaN(dateObj.getTime())) {
                  const yyyy = dateObj.getFullYear();
                  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                  const dd = String(dateObj.getDate()).padStart(2, '0');
                  content = `${dd}/${mm}/${yyyy}`;
                }
              } catch (e) {
                // fallback to original content
              }
            }
          }
          
          // Apply dynamic max-width to prevent horizontal overflow/overlapping
          const pageWidth = templateData.canvasSize?.width || 794;
          if (el.x < 400) {
            elDiv.style.maxWidth = '450px';
          } else {
            elDiv.style.maxWidth = `${pageWidth - xPos - 20}px`;
          }
          elDiv.style.wordBreak = 'break-word';
          elDiv.style.overflowWrap = 'break-word';

          elDiv.innerText = content;
          elDiv.style.whiteSpace = 'pre-line'; // Preserves line breaks for address
        } else if (el.type === 'repeater') {
          elDiv.style.width = `${el.containerWidth}px`;
          elDiv.style.minHeight = `${el.containerHeight}px`;

          dataToUse.items.forEach((item, idx) => {
            const rowDiv = document.createElement('div');
            rowDiv.style.position = 'relative';
            rowDiv.style.minHeight = `${el.rowSpacing}px`;
            rowDiv.style.paddingBottom = '12px'; // Breathing room for borders
            if (el.showRowBorder) {
              rowDiv.style.borderBottom = '1px solid rgba(0, 0, 0, 0.15)';
            }
            rowDiv.style.marginBottom = idx === dataToUse.items.length - 1 ? '0' : (el.showRowBorder ? '0' : '5px');
            rowDiv.style.color = safeColor(el.color);

            el.fields.forEach(field => {
              const fieldDiv = document.createElement('div');
              fieldDiv.style.position = 'absolute';
              fieldDiv.style.left = `${field.x}px`;
              fieldDiv.style.width = `${field.width}px`;
              fieldDiv.style.minHeight = '100%';
              fieldDiv.style.display = 'block';
              fieldDiv.style.overflow = 'hidden';
              fieldDiv.style.whiteSpace = 'normal';
              fieldDiv.style.wordBreak = 'break-all';
              fieldDiv.style.overflowWrap = 'anywhere';
              fieldDiv.style.boxSizing = 'border-box';
              fieldDiv.style.color = safeColor(el.color);
              fieldDiv.style.lineHeight = '1.2';
              fieldDiv.style.padding = '4px 8px 4px 4px';
              
              // Right-align numerical fields
              const isNumeric = ['quantity_string', 'price_per_item', 'mrp', 'total', 'sno'].includes(field.tag);
              if (isNumeric) {
                fieldDiv.style.textAlign = 'right';
              }

              let value = item[field.tag];
              if (field.tag === 'sno') {
                value = (idx + 1).toString();
              } else if (['mrp', 'price_per_item', 'total'].includes(field.tag)) {
                if (idx === 0 && item.item_name === 'Product A') {
                  // Mock data in designer
                  value = value; 
                } else {
                  value = `₹${parseFloat(value || 0).toFixed(2)}`;
                }
              } else {
                value = value || '';
              }

              fieldDiv.innerText = value;
              rowDiv.appendChild(fieldDiv);
            });
            elDiv.appendChild(rowDiv);

            // Dynamically set rowDiv height based on tallest child
            let maxFieldHeight = el.rowSpacing || 30;
            Array.from(rowDiv.children).forEach(child => {
              const childHeight = child.scrollHeight || child.offsetHeight || 0;
              if (childHeight > maxFieldHeight) {
                maxFieldHeight = childHeight;
              }
            });
            rowDiv.style.height = `${maxFieldHeight}px`;
          });
        }
      });

      // Render to Canvas
      const canvas = await html2canvas(renderContainer, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          // Only remove stylesheets that actually use oklch
          const styles = Array.from(clonedDoc.getElementsByTagName('style'));
          styles.forEach(s => {
            if (s.innerHTML.includes('oklch')) s.remove();
          });

          const links = Array.from(clonedDoc.getElementsByTagName('link'));
          links.forEach(l => {
            if (l.rel === 'stylesheet') l.remove(); // Links are harder to check, just remove them
          });

          // Ensure our container is visible and has its styles
          const container = clonedDoc.getElementById("print-render-container");
          if (container) {
            container.style.display = 'block';
            container.style.visibility = 'visible';
            container.style.opacity = '1';
            container.style.backgroundColor = '#ffffff';
          }

          // Hide only major UI components that might interfere
          const uiToHide = clonedDoc.querySelectorAll('header, aside, .dialog, [role="dialog"]');
          uiToHide.forEach(el => {
            if (!el.contains(container)) el.style.display = 'none';
          });
        }
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (!imgData || imgData.length < 100) {
        throw new Error("Generated image is invalid");
      }

      const pdf = new jsPDF({
        orientation: templateData.canvasSize.width > templateData.canvasSize.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [templateData.canvasSize.width, templateData.canvasSize.height]
      });

      pdf.addImage(imgData, 'JPEG', 0, 0, templateData.canvasSize.width, templateData.canvasSize.height);
      pdf.save(`Invoice_${dataToUse.invoice_number || 'Order'}.pdf`);

      document.body.removeChild(wrapper);
      toast.success("Invoice generated successfully!", { id: loadingToast });
      onOpenChange(false);
    } catch (error) {
      console.error("Print Error:", error);
      toast.error("Failed to generate invoice", { id: loadingToast });
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Printer className="w-6 h-6 text-blue-600" />
            Print Invoice
          </DialogTitle>
          <DialogDescription>
            Select a design template to export the invoice for <strong>{activeOrderData?.invoice_number}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 overflow-y-auto max-h-[60vh]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
              <p className="text-muted-foreground animate-pulse">Fetching your templates...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed rounded-xl bg-muted/30">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="font-semibold text-lg">No templates found</p>
              <p className="text-sm text-muted-foreground mb-4">You need to create at least one template in the Designer first.</p>
              <Button variant="outline" onClick={() => window.location.hash = '#/designer'}>
                Go to Invoice Designer
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {templates.map((template) => (
                <Card
                  key={template.id}
                  className={`relative p-4 cursor-pointer transition-all border-2 group hover:shadow-md ${selectedTemplateId === template.id
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-transparent hover:border-zinc-200'
                    }`}
                  onClick={() => setSelectedTemplateId(template.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${selectedTemplateId === template.id ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground group-hover:bg-zinc-100'}`}>
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate">{template.name}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-tight">Saved on {new Date(template.created_at).toLocaleDateString()}</p>
                    </div>
                    {selectedTemplateId === template.id && (
                      <div className="bg-blue-600 text-white rounded-full p-0.5 animate-in zoom-in">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={isPrinting}>
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={!selectedTemplateId || isPrinting || templates.length === 0}
            className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 px-8"
          >
            {isPrinting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Printer className="w-4 h-4 mr-2" />
                Generate PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PrintInvoiceDialog;
