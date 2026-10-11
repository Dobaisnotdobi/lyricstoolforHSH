import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, 
  Sun,
  Moon,
  Trash2, 
  Settings2, 
  ChevronLeft, 
  ChevronRight, 
  Upload, 
  GripVertical,
  Edit3,
  Check,
  X,
  Eye,
  Pencil,
  HelpCircle,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  MoveHorizontal,
  ArrowLeftRight,
  ArrowUpDown
} from 'lucide-react';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'motion/react';
import { Slot, ViewerSettings, FontFamily, TextAlign } from './types';
import { cn } from './utils';
import { BackgroundSettings } from './BackgroundSettings';
import { useUiTheme, type UiTheme } from './useUiTheme';

// --- Components ---

function SortableSlotItem({ 
  slot, 
  isSelected, 
  onSelect, 
  onDelete, 
  onRename
}: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: slot.id });

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(slot.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleRenameSubmit = () => {
    if (editName.trim()) {
      onRename(slot.id, editName.trim());
    } else {
      setEditName(slot.name);
    }
    setIsEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-center gap-2 p-2 rounded-lg transition-all cursor-pointer mb-1",
        isSelected ? "bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700" : "hover:bg-slate-200/50 dark:hover:bg-slate-800/50",
        isDragging && "opacity-50"
      )}
      onClick={() => !isEditing && onSelect(slot.id)}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="p-1 text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing"
      >
        <GripVertical size={14} />
      </div>

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') {
                setEditName(slot.name);
                setIsEditing(false);
              }
            }}
            className="w-full bg-transparent border-none p-0 text-sm font-medium focus:ring-0"
          />
        ) : (
          <p className="text-sm font-medium truncate text-slate-700 dark:text-slate-200" title={slot.name}>
            {slot.name}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          className="p-1 text-slate-400 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300"
        >
          <Edit3 size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(slot.id);
          }}
          className="p-1 text-slate-400 dark:text-slate-400 hover:text-red-500"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

// --- Main App ---

const FONT_FAMILY_MAP: Record<FontFamily, string> = {
  'sans': 'font-sans',
  'serif': 'font-serif',
  'mono': 'font-mono'
};

export default function App() {
  const { theme, setTheme, isDark } = useUiTheme();
  // --- State ---
  const [slots, setSlots] = useState<Slot[]>(() => {
    const saved = localStorage.getItem('lyrics-slots');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(() => {
    const saved = localStorage.getItem('lyrics-selected-slot-id');
    return saved || null;
  });
  const [isEditMode, setIsEditMode] = useState(() => {
    const saved = localStorage.getItem('lyrics-edit-mode');
    return saved === 'true';
  });
  const [settings, setSettings] = useState<ViewerSettings>(() => {
    const defaultSettings: ViewerSettings = {
      textColor: '#1e293b', // slate-800
      backgroundColor: '#ffffff',
      backgroundMode: 'solid',
      gradientStart: '#fdf2f8',
      gradientEnd: '#ede9fe',
      gradientAngle: 135,
      fontSize: '',
      fontFamily: 'serif',
      textAlign: 'left',
      isBold: false,
      paddingX: 2,
      letterSpacing: 0,
      lineHeight: 1.5
    };
    const saved = localStorage.getItem('lyrics-settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { 
          ...defaultSettings, 
          ...parsed,
          paddingX: (typeof parsed.paddingX === 'number') ? parsed.paddingX : defaultSettings.paddingX,
          letterSpacing: (typeof parsed.letterSpacing === 'number') ? parsed.letterSpacing : defaultSettings.letterSpacing,
          lineHeight: (typeof parsed.lineHeight === 'number') ? parsed.lineHeight : defaultSettings.lineHeight
        };
      } catch (e) {
        return defaultSettings;
      }
    }
    return defaultSettings;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('lyrics-sidebar-open');
    return saved === null ? true : saved === 'true';
  });
  const [isDraggingOverSidebar, setIsDraggingOverSidebar] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('lyrics-slots', JSON.stringify(slots));
  }, [slots]);

  useEffect(() => {
    localStorage.setItem('lyrics-settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (selectedSlotId) {
      localStorage.setItem('lyrics-selected-slot-id', selectedSlotId);
    } else {
      localStorage.removeItem('lyrics-selected-slot-id');
    }
  }, [selectedSlotId]);

  useEffect(() => {
    localStorage.setItem('lyrics-sidebar-open', String(isSidebarOpen));
  }, [isSidebarOpen]);

  useEffect(() => {
    localStorage.setItem('lyrics-edit-mode', String(isEditMode));
  }, [isEditMode]);

  // --- Derived State ---
  const sortedSlots = useMemo(() => {
    return [...slots].sort((a, b) => a.order - b.order);
  }, [slots]);

  const selectedSlot = useMemo(() => 
    slots.find(s => s.id === selectedSlotId), 
  [slots, selectedSlotId]);

  // --- Handlers ---
  const addSlot = () => {
    const newId = crypto.randomUUID();
    const newOrder = slots.length > 0 ? Math.max(...slots.map(s => s.order)) + 1 : 0;
    const newSlot: Slot = {
      id: newId,
      name: `슬롯 ${String(slots.length + 1).padStart(3, '0')}`,
      content: '',
      order: newOrder,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setSlots([...slots, newSlot]);
    setSelectedSlotId(newId);
  };

  const addSlotsFromFiles = async (files: File[]) => {
    const txtFiles = files.filter(f => f.type === 'text/plain' || f.name.endsWith('.txt'));
    if (txtFiles.length === 0) return;

    const newSlots: Slot[] = [];
    let currentMaxOrder = slots.length > 0 ? Math.max(...slots.map(s => s.order)) : -1;

    for (const file of txtFiles) {
      try {
        const content = await file.text();
        currentMaxOrder++;
        newSlots.push({
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^/.]+$/, ""), // remove extension
          content: content,
          order: currentMaxOrder,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      } catch (err) {
        console.error("Error reading file:", file.name, err);
      }
    }

    if (newSlots.length > 0) {
      setSlots(prev => [...prev, ...newSlots]);
      setSelectedSlotId(newSlots[0].id);
    }
  };

  const handleSidebarDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverSidebar(true);
  };

  const handleSidebarDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverSidebar(false);
  };

  const handleSidebarDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverSidebar(false);
    
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length > 0) {
      await addSlotsFromFiles(files);
    }
  };

  const deleteSlot = (id: string) => {
    const newSlots = slots.filter(s => s.id !== id);
    setSlots(newSlots);
    if (selectedSlotId === id) {
      setSelectedSlotId(newSlots.length > 0 ? newSlots[0].id : null);
    }
  };

  const deleteAllSlots = () => {
    if (slots.length === 0) return;
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteAll = () => {
    setSlots([]);
    setSelectedSlotId(null);
    setIsDeleteConfirmOpen(false);
  };

  const renameSlot = (id: string, newName: string) => {
    setSlots(slots.map(s => s.id === id ? { ...s, name: newName, updatedAt: Date.now() } : s));
  };

  const updateContent = (content: string) => {
    if (!selectedSlotId) return;
    setSlots(slots.map(s => s.id === selectedSlotId ? { ...s, content, updatedAt: Date.now() } : s));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sortedSlots.findIndex(s => s.id === String(active.id));
      const newIndex = sortedSlots.findIndex(s => s.id === String(over.id));
      
      const reorderedFiltered = arrayMove(sortedSlots, oldIndex, newIndex);
      
      // Update orders in the main slots array
      const updatedSlots = [...slots];
      reorderedFiltered.forEach((slot: Slot, index: number) => {
        const originalSlot = updatedSlots.find(s => s.id === slot.id);
        if (originalSlot) originalSlot.order = index;
      });
      
      setSlots(updatedSlots);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'text/plain' && !file.name.endsWith('.txt')) {
      alert('TXT 파일만 업로드 가능합니다.');
      return;
    }

    if (selectedSlotId) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (selectedSlot?.content && !confirm('기존 내용을 덮어쓰시겠습니까?')) return;
        updateContent(content);
      };
      reader.readAsText(file, 'UTF-8');
    } else {
      await addSlotsFromFiles([file]);
    }
    e.target.value = ''; // Reset input
  };

  // --- Keyboard Navigation ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if (e.key === 'ArrowLeft') {
        const currentIndex = sortedSlots.findIndex(s => s.id === selectedSlotId);
        if (currentIndex > 0) setSelectedSlotId(sortedSlots[currentIndex - 1].id);
      } else if (e.key === 'ArrowRight') {
        const currentIndex = sortedSlots.findIndex(s => s.id === selectedSlotId);
        if (currentIndex < sortedSlots.length - 1) setSelectedSlotId(sortedSlots[currentIndex + 1].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sortedSlots, selectedSlotId]);

  // --- Sensors for DND ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <div className={cn('flex h-screen w-full overflow-hidden bg-slate-100 dark:bg-slate-800 font-sans', isDark && 'ui-dark')}>
      {/* --- Sidebar --- */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 320 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        onDragOver={handleSidebarDragOver}
        onDragLeave={handleSidebarDragLeave}
        onDrop={handleSidebarDrop}
        className={cn(
          "ui-chrome relative flex flex-col bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-700 overflow-hidden transition-colors duration-200",
          isDraggingOverSidebar && "bg-indigo-50/50 dark:bg-indigo-950/50 ring-2 ring-inset ring-indigo-400"
        )}
      >
        <div className="p-4 flex flex-col gap-4 h-full">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Lyrics Slots</h1>
            <button 
              onClick={addSlot}
              className="p-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors shadow-sm"
              title="새 슬롯 추가"
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-all"
              title="TXT 파일 업로드"
            >
              <Upload size={14} />
              TXT 업로드
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
              accept=".txt"
            />
            <button
              onClick={deleteAllSlots}
              className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 transition-all"
              title="모든 슬롯 삭제"
            >
              <Trash2 size={14} />
              전체 삭제
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
            {sortedSlots.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400 dark:text-slate-400 text-center px-4">
                <p className="text-sm">
                  슬롯이 없습니다. + 버튼을 눌러 추가하세요.
                </p>
              </div>
            ) : (
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={sortedSlots.map(s => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {sortedSlots.map((slot: Slot) => (
                    // @ts-ignore
                    <SortableSlotItem
                      key={slot.id}
                      slot={slot}
                      isSelected={selectedSlotId === slot.id}
                      onSelect={(id) => { setSelectedSlotId(id); }}
                      onDelete={deleteSlot}
                      onRename={renameSlot}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      </motion.aside>

      {/* --- Main Content --- */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header Bar */}
        <header className="ui-chrome h-14 bg-white dark:bg-slate-900 border-bottom border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
            >
              <ChevronLeft className={cn("transition-transform", !isSidebarOpen && "rotate-180")} size={20} />
            </button>
            {selectedSlot && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[200px]">
                  {selectedSlot.name}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
              className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            {selectedSlot && (
              <button
                onClick={() => setIsEditMode(!isEditMode)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all border",
                  isEditMode 
                    ? "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
                    : "bg-indigo-50 dark:bg-indigo-950 border-indigo-100 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900"
                )}
              >
                {isEditMode ? <Pencil size={14} /> : <Eye size={14} />}
                {isEditMode ? "수정 모드" : "읽기 모드"}
              </button>
            )}
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={cn(
                "p-2 rounded-md transition-colors",
                isSettingsOpen ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
              title="뷰어 설정"
            >
              <Settings2 size={20} />
            </button>
            <button 
              onClick={() => setIsHelpOpen(true)}
              className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
              title="사용 설명서"
            >
              <HelpCircle size={20} />
            </button>
          </div>
        </header>

        {/* Viewer Area */}
        <div 
          className="flex-1 overflow-y-auto custom-scrollbar py-8 md:py-12 lg:py-20 px-0 transition-colors duration-300"
          style={{
            backgroundColor: settings.backgroundColor,
            backgroundImage: settings.backgroundMode === 'gradient'
              ? `linear-gradient(${settings.gradientAngle}deg, ${settings.gradientStart}, ${settings.gradientEnd})`
              : 'none'
          }}
        >
          <div className="w-full">
            {selectedSlot ? (
              isEditMode ? (
                <textarea
                  value={selectedSlot.content}
                  onChange={(e) => updateContent(e.target.value)}
                  placeholder="여기에 가사를 입력하거나 TXT 파일을 업로드하세요..."
                  className={cn(
                    "w-full min-h-[70vh] bg-transparent border-none resize-none focus:ring-0 p-0 leading-relaxed transition-all duration-300",
                    FONT_FAMILY_MAP[settings.fontFamily],
                    settings.isBold ? "font-bold" : "font-normal"
                  )}
                  style={{ 
                    color: settings.textColor, 
                    fontSize: `${settings.fontSize || 24}px`,
                    textAlign: settings.textAlign,
                    transform: settings.textAlign === 'left' ? `translateX(${settings.paddingX || 0}%)` : settings.textAlign === 'right' ? `translateX(-${settings.paddingX || 0}%)` : 'none',
                    letterSpacing: `${settings.letterSpacing}px`,
                    lineHeight: settings.lineHeight
                  }}
                  autoFocus
                />
              ) : (
                <div
                  className={cn(
                    "w-full min-h-[70vh] whitespace-pre-wrap leading-relaxed transition-all duration-300",
                    FONT_FAMILY_MAP[settings.fontFamily],
                    settings.isBold ? "font-bold" : "font-normal"
                  )}
                  style={{ 
                    color: settings.textColor, 
                    fontSize: `${settings.fontSize || 24}px`,
                    textAlign: settings.textAlign,
                    transform: settings.textAlign === 'left' ? `translateX(${settings.paddingX || 0}%)` : settings.textAlign === 'right' ? `translateX(-${settings.paddingX || 0}%)` : 'none',
                    letterSpacing: `${settings.letterSpacing}px`,
                    lineHeight: settings.lineHeight
                  }}
                >
                  {selectedSlot.content || (
                    <span className="text-slate-300 italic">가사가 비어 있습니다. 수정 모드에서 가사를 입력하세요.</span>
                  )}
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400 dark:text-slate-400">
                <div className="p-6 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                  <Edit3 size={48} className="text-slate-300" />
                </div>
                <h2 className="text-xl font-medium text-slate-500 dark:text-slate-400 mb-2">선택된 슬롯이 없습니다</h2>
                <p className="text-sm">왼쪽 패널에서 슬롯을 선택하거나 새로 추가하세요.</p>
              </div>
            )}
          </div>
        </div>

        {/* Settings Panel (Overlay) */}
        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="ui-chrome absolute top-16 right-4 w-72 max-w-[calc(100%-2rem)] max-h-[calc(100%-5rem)] overflow-y-auto custom-scrollbar bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-5 z-20"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 dark:text-slate-100">뷰어 설정</h3>
                <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label htmlFor="ui-theme" className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">UI 테마</label>
                  <select id="ui-theme" value={theme} onChange={e => setTheme(e.target.value as UiTheme)}
                    className="w-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 text-sm border border-slate-200 dark:border-slate-700">
                    <option value="light">라이트</option>
                    <option value="dark">다크</option>
                    <option value="system">시스템 설정</option>
                  </select>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">메뉴와 설정창에 적용됩니다. 가사 색상과 배경은 유지됩니다.</p>
                </div>
                {/* Font Family */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">글꼴</label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    {(['sans', 'serif', 'mono'] as FontFamily[]).map((font) => (
                      <button
                        key={font}
                        onClick={() => setSettings({ ...settings, fontFamily: font })}
                        className={cn(
                          "py-1.5 text-[10px] font-bold rounded-md transition-all capitalize",
                          settings.fontFamily === font ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-100"
                        )}
                      >
                        {font}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Size */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">텍스트 크기 (px)</label>
                  <div className="flex items-center gap-2">
                    <Type size={16} className="text-slate-400 dark:text-slate-400" />
                    <input 
                      type="number" 
                      value={settings.fontSize}
                      placeholder="24"
                      onChange={(e) => setSettings({ ...settings, fontSize: e.target.value ? Number(e.target.value) : '' })}
                      className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
                      min="8"
                      max="120"
                    />
                  </div>
                </div>

                {/* Text Align */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">정렬</label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    {(['left', 'center', 'right'] as TextAlign[]).map((align) => (
                      <button
                        key={align}
                        onClick={() => setSettings({ ...settings, textAlign: align })}
                        className={cn(
                          "py-1.5 flex justify-center items-center rounded-md transition-all",
                          settings.textAlign === align ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-100"
                        )}
                      >
                        {align === 'left' && <AlignLeft size={16} />}
                        {align === 'center' && <AlignCenter size={16} />}
                        {align === 'right' && <AlignRight size={16} />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Margin Slider */}
                <div className={cn("transition-opacity duration-300", settings.textAlign === 'center' ? "opacity-40 pointer-events-none" : "opacity-100")}>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block flex justify-between items-center">
                    <span>여백 조절 (%)</span>
                    <span className="text-indigo-600 dark:text-indigo-300 font-mono">{settings.paddingX || 0}%</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <MoveHorizontal size={16} className="text-slate-400 dark:text-slate-400 shrink-0" />
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={settings.paddingX || 0}
                      onChange={(e) => setSettings({ ...settings, paddingX: Number(e.target.value) })}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                </div>

                {/* Letter Spacing Slider */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block flex justify-between items-center">
                    <span>자간 조절 (px)</span>
                    <span className="text-indigo-600 dark:text-indigo-300 font-mono">{settings.letterSpacing}px</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <ArrowLeftRight size={16} className="text-slate-400 dark:text-slate-400 shrink-0" />
                    <input 
                      type="range" 
                      min="-5" 
                      max="20" 
                      step="0.5"
                      value={settings.letterSpacing}
                      onChange={(e) => setSettings({ ...settings, letterSpacing: Number(e.target.value) })}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                </div>

                {/* Line Height Slider */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block flex justify-between items-center">
                    <span>행간 조절 (배수)</span>
                    <span className="text-indigo-600 dark:text-indigo-300 font-mono">{settings.lineHeight}x</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <ArrowUpDown size={16} className="text-slate-400 dark:text-slate-400 shrink-0" />
                    <input 
                      type="range" 
                      min="1" 
                      max="3" 
                      step="0.1"
                      value={settings.lineHeight}
                      onChange={(e) => setSettings({ ...settings, lineHeight: Number(e.target.value) })}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                </div>

                {/* Font Weight */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">텍스트 굵기</label>
                  <button
                    onClick={() => setSettings({ ...settings, isBold: !settings.isBold })}
                    className={cn(
                      "w-full py-2 rounded-lg font-bold transition-all border",
                      settings.isBold 
                        ? "bg-indigo-600 text-white border-indigo-600" 
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                    )}
                  >
                    {settings.isBold ? "BOLD ON" : "BOLD OFF"}
                  </button>
                </div>

                {/* Colors */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">텍스트 색상</label>
                    <div className="flex flex-wrap gap-2">
                      {['#1e293b', '#475569', '#ffffff', '#ef4444', '#10b981', '#3b82f6'].map(color => (
                        <button
                          key={color}
                          onClick={() => setSettings({ ...settings, textColor: color })}
                          className={cn(
                            "w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 transition-transform hover:scale-110",
                            settings.textColor === color && "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                      <input 
                        type="color" 
                        value={settings.textColor} 
                        onChange={(e) => setSettings({ ...settings, textColor: e.target.value })}
                        className="w-8 h-8 rounded-full border-none p-0 overflow-hidden cursor-pointer"
                      />
                    </div>
                  </div>

                  <BackgroundSettings settings={settings} onChange={(changes) => setSettings(previous => ({ ...previous, ...changes }))} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Help Modal */}
        <AnimatePresence>
          {isHelpOpen && (
            <div className="ui-chrome fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
              >
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
                  <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-300">
                    <HelpCircle size={24} />
                    <h2 className="text-xl font-bold tracking-tight">사용 설명서</h2>
                  </div>
                  <button 
                    onClick={() => setIsHelpOpen(false)}
                    className="p-2 text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                  <div className="space-y-8">
                    <section>
                      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                        <Plus className="text-indigo-500" size={18} />
                        슬롯 관리
                      </h3>
                      <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed list-disc pl-5">
                        <li>왼쪽 상단의 <span className="font-bold text-indigo-600 dark:text-indigo-300">+</span> 버튼을 눌러 새로운 가사 슬롯을 추가할 수 있습니다.</li>
                        <li>슬롯 이름을 클릭하면 해당 가사를 불러옵니다.</li>
                        <li>슬롯의 <span className="font-bold">Grip(점 6개)</span> 아이콘을 드래그하여 순서를 자유롭게 변경할 수 있습니다.</li>
                        <li>슬롯에 마우스를 올리면 나타나는 <span className="font-bold">수정(연필)</span> 아이콘으로 이름을 변경하거나, <span className="font-bold">삭제(휴지통)</span> 아이콘으로 슬롯을 제거할 수 있습니다.</li>
                      </ul>
                    </section>

                    <section>
                      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                        <Eye className="text-indigo-500" size={18} />
                        읽기 및 수정 모드
                      </h3>
                      <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed list-disc pl-5">
                        <li>상단의 <span className="font-bold text-indigo-600 dark:text-indigo-300">읽기 모드 / 수정 모드</span> 버튼으로 상태를 전환할 수 있습니다.</li>
                        <li><span className="font-bold">읽기 모드</span>: 가사를 감상하거나 스크롤할 때 실수를 방지하기 위해 텍스트가 고정됩니다.</li>
                        <li><span className="font-bold">수정 모드</span>: 가사를 직접 입력하거나 내용을 편집할 수 있습니다.</li>
                      </ul>
                    </section>

                    <section>
                      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                        <Settings2 className="text-indigo-500" size={18} />
                        뷰어 커스터마이징
                      </h3>
                      <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed list-disc pl-5">
                        <li>상단의 <span className="font-bold text-indigo-600 dark:text-indigo-300">설정(톱니바퀴)</span> 아이콘을 눌러 뷰어 환경을 바꿀 수 있습니다.</li>
                        <li><span className="font-bold">글꼴</span>: Sans(고딕), Serif(명조), Mono(코딩 폰트) 중 선택 가능합니다.</li>
                        <li><span className="font-bold">텍스트 크기</span>: 원하는 픽셀(px) 수치를 직접 입력하여 세밀하게 조절합니다.</li>
                        <li><span className="font-bold">좌우 여백</span>: 0%에서 100%까지 가시 영역 내에서의 여백을 조절할 수 있습니다. (기본 2%)</li>
                        <li><span className="font-bold">자간 및 행간</span>: 글자 사이의 간격(자간)과 줄 사이의 간격(행간)을 슬라이더로 조절할 수 있습니다.</li>
                        <li><span className="font-bold">정렬 및 굵기</span>: 좌/중/우 정렬과 텍스트 굵기(Bold) 토글을 지원합니다.</li>
                        <li><span className="font-bold">색상</span>: 텍스트와 배경 색상을 자유롭게 변경하여 눈이 편한 환경을 만드세요.</li>
                      </ul>
                    </section>

                    <section>
                      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                        <Upload className="text-indigo-500" size={18} />
                        파일 연동 및 드래그 앤 드랍
                      </h3>
                      <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed list-disc pl-5">
                        <li>상단의 <span className="font-bold text-indigo-600 dark:text-indigo-300">TXT 업로드</span> 버튼을 눌러 현재 슬롯에 가사를 불러올 수 있습니다.</li>
                        <li><span className="font-bold text-indigo-600 dark:text-indigo-300">강력 추천</span>: 컴퓨터의 <span className="font-bold">.txt 파일을 왼쪽 슬롯 목록 영역으로 드래그 앤 드랍</span>하면 파일명으로 된 새 슬롯이 즉시 생성됩니다. 여러 파일을 한꺼번에 넣을 수도 있습니다.</li>
                      </ul>
                    </section>

                    <section>
                      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                        <Trash2 className="text-indigo-500" size={18} />
                        기타 편의 기능
                      </h3>
                      <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed list-disc pl-5">
                        <li><span className="font-bold">키보드 단축키</span>: 키보드의 <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">←</kbd> <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">→</kbd> 화살표 키로 슬롯을 빠르게 넘겨볼 수 있습니다.</li>
                        <li><span className="font-bold">전체 삭제</span>: 슬롯 목록 상단의 버튼을 통해 모든 슬롯을 한 번에 비울 수 있습니다.</li>
                      </ul>
                    </section>
                  </div>
                </div>

                <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex justify-end">
                  <button 
                    onClick={() => setIsHelpOpen(false)}
                    className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md active:scale-95"
                  >
                    확인했습니다
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Delete All Confirmation Modal */}
        <AnimatePresence>
          {isDeleteConfirmOpen && (
            <div className="ui-chrome fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col"
              >
                <div className="p-6 text-center">
                  <div className="w-16 h-16 bg-red-50 dark:bg-red-950 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={32} />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">정말 삭제하겠습니까?</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">삭제 후 복구할 수 없습니다.</p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-950 flex gap-3">
                  <button 
                    onClick={() => setIsDeleteConfirmOpen(false)}
                    className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95"
                  >
                    No
                  </button>
                  <button 
                    onClick={confirmDeleteAll}
                    className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-md active:scale-95"
                  >
                    Yes
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Footer Navigation Info */}
        <footer className="ui-chrome h-8 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 text-[10px] text-slate-400 dark:text-slate-400 font-medium">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded shadow-xs">←</kbd> 이전 슬롯
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded shadow-xs">→</kbd> 다음 슬롯
            </span>
          </div>
          <div>
            {selectedSlot && `최종 수정: ${new Date(selectedSlot.updatedAt).toLocaleString()}`}
          </div>
        </footer>
      </main>
    </div>
  );
}
