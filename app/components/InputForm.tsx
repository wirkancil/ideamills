'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Upload, Sparkles, Search, Wand2, CheckCircle, Loader2, ChevronDown } from 'lucide-react';

type PresetName = 'fast' | 'balanced' | 'premium' | 'custom';

interface ModelConfig {
  preset: PresetName;
  vision?: string;
  ideation?: string;
  embedding?: string;
  scripting?: string;
  visualPrompt?: string;
  text2img?: string;
}

const PRESET_OPTIONS: { value: PresetName; label: string; description: string }[] = [
  { value: 'fast', label: 'Fast & Cheap', description: 'Gemini Flash semua layer — paling cepat, hemat kredit' },
  { value: 'balanced', label: 'Balanced', description: 'Gemini Pro vision + Gemini Flash script — default terbaik' },
  { value: 'premium', label: 'Premium', description: 'Claude vision + Gemini Pro ideation & script — kualitas tertinggi' },
  { value: 'custom', label: 'Custom', description: 'Pilih model per layer secara manual' },
];

const VISION_MODELS = [
  { id: 'openai/gpt-5', label: 'GPT-5' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
];

const IDEATION_MODELS = [
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { id: 'openai/gpt-5', label: 'GPT-5' },
];

const SCRIPTING_MODELS = [
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { id: 'openai/gpt-5', label: 'GPT-5' },
];

const TEXT2IMG_MODELS = [
  { id: 'google/gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
  { id: 'google/gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image (Preview)' },
];

interface CreativeIdea {
  title: string;
  concept: string;
  storyline: string;
  key_message?: string;
  why_effective?: string;
}

interface ImageAnalysis {
  // Product Analysis
  brand?: string;
  category?: string;
  form_factor?: string;
  key_benefit?: string;
  target_audience?: string;
  color_scheme?: string;
  style?: string;
  notable_text?: string;
  additional_notes?: string;

  // Model Analysis
  age_range?: string;
  gender?: string;
  ethnicity?: string;
  hair_style?: string;
  skin_tone?: string;
  expression?: string;
  body_type?: string;
  pose?: string;
  model_notes?: string;
}

export function InputForm() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<'upload' | 'analyze' | 'edit' | 'creative' | 'enhance' | 'generate'>('upload');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Image states
  const [productImage, setProductImage] = useState<File | null>(null);
  const [modelImage, setModelImage] = useState<File | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string>('');
  const [modelImageUrl, setModelImageUrl] = useState<string>('');

  // Analysis states
  const [productAnalysis, setProductAnalysis] = useState<ImageAnalysis | null>(null);
  const [modelAnalysis, setModelAnalysis] = useState<ImageAnalysis | null>(null);
  const [editedProductAnalysis, setEditedProductAnalysis] = useState<ImageAnalysis>({});
  const [editedModelAnalysis, setEditedModelAnalysis] = useState<ImageAnalysis>({});

  // Idea states
  const [basicIdea, setBasicIdea] = useState('');
  const [modelConfig, setModelConfig] = useState<ModelConfig>({ preset: 'balanced' });
  const [showAdvancedModel, setShowAdvancedModel] = useState(false);

  // Creative ideas states
  const [generatingIdeas, setGeneratingIdeas] = useState(false);
  const [creativeIdeas, setCreativeIdeas] = useState<CreativeIdea[]>([]);
  const [selectedCreativeIdea, setSelectedCreativeIdea] = useState<CreativeIdea | null>(null);
  const [editedCreativeIdea, setEditedCreativeIdea] = useState<CreativeIdea | null>(null);
  const [storyboardCount, setStoryboardCount] = useState<number>(5);

  // Upload images to get URLs
  const uploadImages = async () => {
    let modUrl = '';

    // Upload product image
    const productFormData = new FormData();
    productFormData.append('file', productImage!);
    const productUpload = await fetch('/api/upload', {
      method: 'POST',
      body: productFormData,
    });

    if (!productUpload.ok) {
      const error = await productUpload.json();
      throw new Error(`Upload gambar produk gagal: ${error.error || 'Unknown error'}`);
    }

    const { url: prodUrl } = await productUpload.json();
    setProductImageUrl(prodUrl);

    // Upload model image if provided
    if (modelImage) {
      const modelFormData = new FormData();
      modelFormData.append('file', modelImage);
      const modelUpload = await fetch('/api/upload', {
        method: 'POST',
        body: modelFormData,
      });

      if (!modelUpload.ok) {
        const error = await modelUpload.json();
        throw new Error(`Upload gambar model gagal: ${error.error || 'Unknown error'}`);
      }

      const modelResult = await modelUpload.json();
      modUrl = modelResult.url;
      setModelImageUrl(modUrl);
    }

    return { productUrl: prodUrl, modelUrl: modelImage ? modUrl : null };
  };

  // Helper to convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Analyze images
  const handleAnalyzeImages = async () => {
    if (!productImage) {
      setErrorMsg('Upload gambar produk terlebih dahulu!');
          return;
        }
        
    setErrorMsg(null);
    setAnalyzing(true);
    setCurrentStep('analyze');

    try {
      // Convert images to base64 for direct analysis (bypassing server-side download issues)
      const productBase64 = await fileToBase64(productImage);
      const modelBase64 = modelImage ? await fileToBase64(modelImage) : null;

      // Upload images first (to keep them saved/accessible via URL for other purposes)
      // We don't strictly need the result URL for analysis now, but good to keep the flow
      try {
        await uploadImages();
      } catch (uploadError) {
      }

      const analysisResponse = await fetch('/api/analyze-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productImageUrl: productBase64,
          modelImageUrl: modelBase64,
          visionModel: modelConfig.vision,
        }),
      });

      if (!analysisResponse.ok) {
        const error = await analysisResponse.json();
        const details = error.details ? `Details: ${JSON.stringify(error.details)}` : '';
        throw new Error(`Analisis gambar gagal: ${error.error || 'Unknown error'}. ${details}`);
      }

      const analysisResult = await analysisResponse.json();
      setProductAnalysis(analysisResult.product || {});
      setModelAnalysis(analysisResult.model || null);

      // Set initial edited values
      setEditedProductAnalysis(analysisResult.product || {});
      setEditedModelAnalysis(analysisResult.model || {});

      setCurrentStep('edit');

    } catch (error) {
      setErrorMsg(`Error: ${error instanceof Error ? error.message : 'Analisis gagal'}`);
      setCurrentStep('upload');
    } finally {
      setAnalyzing(false);
    }
  };

  // Generate creative ideas
  const handleGenerateCreativeIdeas = async () => {
    if (!productAnalysis) {
      setErrorMsg('Analisis gambar wajib dilakukan terlebih dahulu!');
      return;
    }

    if (!basicIdea.trim()) {
      // Set default basic idea if empty
      const finalProductAnalysis = { ...productAnalysis, ...editedProductAnalysis };
      const defaultIdea = `${finalProductAnalysis.brand || 'Produk'} ${finalProductAnalysis.category || 'kecantikan'} adalah solusi terbaik untuk ${finalProductAnalysis.key_benefit || 'perawatan kulit'}.`;
      setBasicIdea(defaultIdea);
    }

    setErrorMsg(null);
    setGeneratingIdeas(true);
    setCurrentStep('creative');

    try {
      const finalProductAnalysis = { ...productAnalysis, ...editedProductAnalysis };
      const finalModelAnalysis = modelAnalysis ? { ...modelAnalysis, ...editedModelAnalysis } : null;

      const response = await fetch('/api/generate-creative-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productAnalysis: finalProductAnalysis,
          modelAnalysis: finalModelAnalysis,
          basicIdea,
          preset: modelConfig.preset,
          modelConfig: { preset: modelConfig.preset, ideation: modelConfig.ideation },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Generate ide kreatif gagal: ${error.error || 'Unknown error'}`);
      }

      const result = await response.json();
      setCreativeIdeas(result.creativeIdeas || []);

    } catch (error) {
      setErrorMsg(`Error: ${error instanceof Error ? error.message : 'Generate ide kreatif gagal'}`);
      setCurrentStep('edit');
    } finally {
      setGeneratingIdeas(false);
    }
  };

  // Select creative idea
  const handleSelectCreativeIdea = (idea: CreativeIdea) => {
    setSelectedCreativeIdea(idea);
    setEditedCreativeIdea({ ...idea });
    setCurrentStep('enhance');
  };

  // Final generate — submit structured payload directly
  const handleFinalGenerate = async () => {
    if (!editedCreativeIdea) {
      setErrorMsg('Pilih ide kreatif terlebih dahulu!');
      return;
    }
    if (!productImageUrl) {
      setErrorMsg('Gambar produk belum terupload. Coba analisis ulang.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);
    setCurrentStep('generate');

    try {
      const finalProduct = { ...productAnalysis, ...editedProductAnalysis };
      const finalModel = modelAnalysis ? { ...modelAnalysis, ...editedModelAnalysis } : null;

      const response = await fetch('/api/generate-enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productImageUrl,
          modelImageUrl: modelImageUrl || null,
          basicIdea,
          storyboardCount,
          product: finalProduct,
          model: finalModel,
          creativeIdea: {
            title: editedCreativeIdea.title,
            concept: editedCreativeIdea.concept,
            storyline: editedCreativeIdea.storyline,
            key_message: editedCreativeIdea.key_message,
            why_effective: editedCreativeIdea.why_effective,
          },
          modelConfig,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Generate gagal');
      }
      if (!result.generationId) {
        throw new Error('Server tidak mengembalikan generation ID');
      }

      router.push(`/generations/${result.generationId}`);

    } catch (error) {
      setErrorMsg(`Error: ${error instanceof Error ? error.message : 'Generate gagal'}`);
      setCurrentStep('enhance');
    } finally {
      setLoading(false);
    }
  };

  // Step indicators
  const steps = [
    { id: 'upload', label: 'Upload', icon: Upload, completed: productImage !== null },
    { id: 'analyze', label: 'Analisis', icon: Search, completed: productAnalysis !== null },
    { id: 'edit', label: 'Detail', icon: Wand2, completed: productAnalysis !== null && currentStep !== 'analyze' },
    { id: 'creative', label: 'Ide', icon: Sparkles, completed: creativeIdeas.length > 0 },
    { id: 'enhance', label: 'Review', icon: CheckCircle, completed: selectedCreativeIdea !== null },
    { id: 'generate', label: 'Generate', icon: Loader2, completed: false },
  ];

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          Buat Variasi Iklan Video
        </CardTitle>
        <CardDescription>
          Upload → Analisis AI → Edit detail → Pilih ide kreatif → Review → Generate storyboard
        </CardDescription>

        {/* Step Progress */}
        <div className="flex items-center justify-between mt-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = step.completed;
            const isPast = steps.findIndex(s => s.id === currentStep) > index;

            return (
              <div key={step.id} className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                  isCompleted || isPast
                    ? 'bg-green-500 border-green-500 text-white'
                    : isActive
                    ? 'border-blue-500 text-blue-500'
                    : 'border-gray-300 text-gray-400'
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-xs mt-1 ${
                  isActive ? 'text-blue-600 font-medium' : 'text-gray-500'
                }`}>
                  {step.label}
                </span>
                {index < steps.length - 1 && (
                  <div className={`w-12 h-0.5 mt-2 ${
                    isPast || isCompleted ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </CardHeader>

      <CardContent>
        {/* Inline error banner */}
        {errorMsg && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <span className="mt-0.5 shrink-0">⚠</span>
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="ml-auto shrink-0 opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Step 1: Upload Images */}
        {currentStep === 'upload' && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Step 1: Upload Gambar</h3>

          {/* Product Image */}
          <div className="space-y-2">
            <Label htmlFor="product-image">
              Gambar Produk <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-4">
              <Input
                id="product-image"
                type="file"
                accept="image/*"
                onChange={(e) => setProductImage(e.target.files?.[0] || null)}
                className="flex-1"
              />
              {productImage && (
                <div className="text-sm text-muted-foreground">
                  ✓ {productImage.name}
                </div>
              )}
            </div>
          </div>

          {/* Model Image */}
          <div className="space-y-2">
            <Label htmlFor="model-image">Gambar Model (Opsional)</Label>
            <div className="flex items-center gap-4">
              <Input
                id="model-image"
                type="file"
                accept="image/*"
                onChange={(e) => setModelImage(e.target.files?.[0] || null)}
                className="flex-1"
              />
              {modelImage && (
                <div className="text-sm text-muted-foreground">
                  ✓ {modelImage.name}
                </div>
              )}
            </div>
          </div>

          {/* Model Preset Selection */}
          <div className="space-y-2">
            <Label>Model Preset</Label>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setModelConfig({ ...modelConfig, preset: opt.value })}
                  className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                    modelConfig.preset === opt.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowAdvancedModel(!showAdvancedModel)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedModel ? 'rotate-180' : ''}`} />
              {showAdvancedModel ? 'Sembunyikan' : 'Advanced'} — pilih model per layer
            </button>
            {showAdvancedModel && (
              <div className="space-y-3 pt-2 pl-2 border-l-2 border-border">
                <div className="space-y-1">
                  <Label className="text-xs">Vision (analisis gambar)</Label>
                  <Select
                    value={modelConfig.vision ?? ''}
                    onValueChange={(v) => setModelConfig({ ...modelConfig, preset: 'custom', vision: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Gunakan preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {VISION_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ideation & Creative Ideas</Label>
                  <Select
                    value={modelConfig.ideation ?? ''}
                    onValueChange={(v) => setModelConfig({ ...modelConfig, preset: 'custom', ideation: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Gunakan preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {IDEATION_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Scripting</Label>
                  <Select
                    value={modelConfig.scripting ?? ''}
                    onValueChange={(v) => setModelConfig({ ...modelConfig, preset: 'custom', scripting: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Gunakan preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {SCRIPTING_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Image Generation</Label>
                  <Select
                    value={modelConfig.text2img ?? ''}
                    onValueChange={(v) => setModelConfig({ ...modelConfig, preset: 'custom', text2img: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Gunakan preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {TEXT2IMG_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

              {/* Basic Idea Input */}
              <div className="space-y-2">
                <Label htmlFor="basic-idea">Ide Dasar (Opsional - akan digunakan untuk generate ide kreatif)</Label>
                <Textarea
                  id="basic-idea"
                  value={basicIdea}
                  onChange={(e) => setBasicIdea(e.target.value)}
                  placeholder="Contoh: dr. FAY Cream Penghilang Flek Hitam dan Bekas Jerawat Resmi BPOM adalah solusi terbaik untuk perawatan jerawat dan masalah kulit flek hitam."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Ide dasar ini akan digunakan AI untuk menghasilkan berbagai ide kreatif yang berbeda untuk kampanye iklan Anda.
                </p>
              </div>
            </div>

            <Button
              onClick={handleAnalyzeImages}
              disabled={!productImage || analyzing}
              className="w-full"
              size="lg"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Menganalisis Gambar...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Analisis Gambar
                </>
              )}
            </Button>
          </div>
        )}

        {/* Step 2-3: Edit Analysis */}
        {(currentStep === 'analyze' || currentStep === 'edit') && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">
                {currentStep === 'analyze' ? 'Step 2: Menganalisis Gambar...' : 'Step 3: Lengkapi & Edit Detail Produk'}
              </h3>

              {analyzing ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
                    <p className="text-muted-foreground">Menganalisis gambar dengan AI...</p>
                  </div>
                </div>
              ) : (
                <Tabs defaultValue="product" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="product">Produk</TabsTrigger>
                    <TabsTrigger value="model" disabled={!modelAnalysis}>Model</TabsTrigger>
                  </TabsList>

                  <TabsContent value="product" className="space-y-6">
                    <div className="space-y-4">
                      <h4 className="font-medium text-primary">Detail Produk</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Brand */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Brand/Merk</Label>
                          <Input
                            value={editedProductAnalysis.brand || productAnalysis?.brand || ''}
                            onChange={(e) => setEditedProductAnalysis(prev => ({
                              ...prev,
                              brand: e.target.value
                            }))}
                            placeholder="Contoh: dr. FAY, Garnier, etc."
                          />
                        </div>

                        {/* Category */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Kategori Produk</Label>
                          <Input
                            value={editedProductAnalysis.category || productAnalysis?.category || ''}
                            onChange={(e) => setEditedProductAnalysis(prev => ({
                              ...prev,
                              category: e.target.value
                            }))}
                            placeholder="Contoh: Skincare, Makeup, Beverage, dll"
                          />
                        </div>

                        {/* Form Factor */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Form Factor/Bentuk</Label>
                          <Input
                            value={editedProductAnalysis.form_factor || productAnalysis?.form_factor || ''}
                            onChange={(e) => setEditedProductAnalysis(prev => ({
                              ...prev,
                              form_factor: e.target.value
                            }))}
                            placeholder="Contoh: Jar, Bottle, Tube, Box"
                          />
                        </div>

                        {/* Key Benefit */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Manfaat Utama</Label>
                          <Input
                            value={editedProductAnalysis.key_benefit || productAnalysis?.key_benefit || ''}
                            onChange={(e) => setEditedProductAnalysis(prev => ({
                              ...prev,
                              key_benefit: e.target.value
                            }))}
                            placeholder="Contoh: correcting dark spot, whitening, anti-aging"
                          />
                        </div>

                        {/* Target Audience */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Target Audience</Label>
                          <Input
                            value={editedProductAnalysis.target_audience || productAnalysis?.target_audience || ''}
                            onChange={(e) => setEditedProductAnalysis(prev => ({
                              ...prev,
                              target_audience: e.target.value
                            }))}
                            placeholder="Contoh: Remaja, Wanita Dewasa, Pria, dll"
                          />
                        </div>

                        {/* Color Scheme */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Skema Warna</Label>
                          <Input
                            value={editedProductAnalysis.color_scheme || productAnalysis?.color_scheme || ''}
                            onChange={(e) => setEditedProductAnalysis(prev => ({
                              ...prev,
                              color_scheme: e.target.value
                            }))}
                            placeholder="Contoh: white, yellow, blue"
                          />
                        </div>

                        {/* Style */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Style/Gaya</Label>
                          <Input
                            value={editedProductAnalysis.style || productAnalysis?.style || ''}
                            onChange={(e) => setEditedProductAnalysis(prev => ({
                              ...prev,
                              style: e.target.value
                            }))}
                            placeholder="Contoh: Minimalis, Luxury, Modern, dll"
                          />
                        </div>

                        {/* Notable Text */}
                        <div className="space-y-2 md:col-span-2">
                          <Label className="text-sm font-medium">Teks Penting/Notable Text</Label>
            <Textarea
                            value={editedProductAnalysis.notable_text || productAnalysis?.notable_text || ''}
                            onChange={(e) => setEditedProductAnalysis(prev => ({
                              ...prev,
                              notable_text: e.target.value
                            }))}
                            placeholder="Teks yang terlihat di kemasan, slogan, atau informasi penting lainnya"
              rows={2}
            />
          </div>

                        {/* Additional Notes */}
                        <div className="space-y-2 md:col-span-2">
                          <Label className="text-sm font-medium">Catatan Tambahan (Opsional)</Label>
                          <Textarea
                            value={editedProductAnalysis.additional_notes || productAnalysis?.additional_notes || ''}
                            onChange={(e) => setEditedProductAnalysis(prev => ({
                              ...prev,
                              additional_notes: e.target.value
                            }))}
                            placeholder="Informasi tambahan yang mungkin berguna untuk kreasi iklan"
                            rows={2}
                          />
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="model" className="space-y-6">
                    {modelAnalysis && (
                      <div className="space-y-4">
                        <h4 className="font-medium text-primary">Detail Model</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Age Range */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Rentang Usia</Label>
                            <Input
                              value={editedModelAnalysis.age_range || modelAnalysis?.age_range || ''}
                              onChange={(e) => setEditedModelAnalysis(prev => ({
                                ...prev,
                                age_range: e.target.value
                              }))}
                              placeholder="Contoh: 20-25 tahun, Remaja, Anak-anak"
                            />
                          </div>

                          {/* Gender */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Gender</Label>
                            <Input
                              value={editedModelAnalysis.gender || modelAnalysis?.gender || ''}
                              onChange={(e) => setEditedModelAnalysis(prev => ({
                                ...prev,
                                gender: e.target.value
                              }))}
                              placeholder="Contoh: Wanita, Pria"
                            />
                          </div>

                          {/* Ethnicity */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Etnis/Kulit</Label>
                            <Input
                              value={editedModelAnalysis.ethnicity || modelAnalysis?.ethnicity || ''}
                              onChange={(e) => setEditedModelAnalysis(prev => ({
                                ...prev,
                                ethnicity: e.target.value
                              }))}
                              placeholder="Contoh: Asia, Kaukasia, Indonesia"
                            />
                          </div>

                          {/* Hair Style */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Model Rambut</Label>
                            <Input
                              value={editedModelAnalysis.hair_style || modelAnalysis?.hair_style || ''}
                              onChange={(e) => setEditedModelAnalysis(prev => ({
                                ...prev,
                                hair_style: e.target.value
                              }))}
                              placeholder="Contoh: Panjang Lurus, Pendek, Bergelombang"
                            />
                          </div>

                          {/* Skin Tone */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Warna Kulit</Label>
                            <Input
                              value={editedModelAnalysis.skin_tone || modelAnalysis?.skin_tone || ''}
                              onChange={(e) => setEditedModelAnalysis(prev => ({
                                ...prev,
                                skin_tone: e.target.value
                              }))}
                              placeholder="Contoh: Cerah, Sawo Matang, Gelap"
                            />
                          </div>

                          {/* Expression */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Ekspresi Wajah</Label>
                            <Input
                              value={editedModelAnalysis.expression || modelAnalysis?.expression || ''}
                              onChange={(e) => setEditedModelAnalysis(prev => ({
                                ...prev,
                                expression: e.target.value
                              }))}
                              placeholder="Contoh: Tersenyum, Serius, Percaya Diri"
                            />
                          </div>

                          {/* Body Type */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Tipe Tubuh</Label>
                            <Input
                              value={editedModelAnalysis.body_type || modelAnalysis?.body_type || ''}
                              onChange={(e) => setEditedModelAnalysis(prev => ({
                                ...prev,
                                body_type: e.target.value
                              }))}
                              placeholder="Contoh: Rata-rata, Atletis, Slim"
                            />
                          </div>

                          {/* Pose */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Pose/Posisi</Label>
                            <Input
                              value={editedModelAnalysis.pose || modelAnalysis?.pose || ''}
                              onChange={(e) => setEditedModelAnalysis(prev => ({
                                ...prev,
                                pose: e.target.value
                              }))}
                              placeholder="Contoh: Portrait, Full Body, Action"
                            />
                          </div>

                          {/* Model Notes */}
                          <div className="space-y-2 md:col-span-2">
                            <Label className="text-sm font-medium">Catatan Model (Opsional)</Label>
                            <Textarea
                              value={editedModelAnalysis.model_notes || modelAnalysis?.model_notes || ''}
                              onChange={(e) => setEditedModelAnalysis(prev => ({
                                ...prev,
                                model_notes: e.target.value
                              }))}
                              placeholder="Deskripsi tambahan tentang model, seperti aura, karakteristik unik, dll."
                              rows={2}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </div>

            {!analyzing && (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep('upload')}
                  className="flex-1"
                >
                  Kembali
                </Button>
                <Button
                  onClick={handleGenerateCreativeIdeas}
                  disabled={generatingIdeas}
                  className="flex-1"
                >
                  {generatingIdeas ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Membuat Ide Kreatif...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Ide Kreatif
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Creative Ideas */}
        {currentStep === 'creative' && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Step 4: Pilih Ide Kreatif dari AI</h3>

              {generatingIdeas ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
                    <p className="text-muted-foreground">AI sedang membuat ide kreatif...</p>
                    <p className="text-sm text-muted-foreground mt-2">Berdasarkan analisis produk dan ide dasar Anda</p>
                  </div>
                </div>
              ) : creativeIdeas.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-muted-foreground">
                    AI telah menghasilkan {creativeIdeas.length} ide kreatif berdasarkan ide dasar Anda. Pilih salah satu untuk dilanjutkan:
                  </p>

                  <div className="grid gap-4">
                    {creativeIdeas.map((idea, index) => (
                      <Card key={index} className={`cursor-pointer transition-all hover:shadow-md ${
                        selectedCreativeIdea === idea ? 'ring-2 ring-primary' : ''
                      }`}>
                        <CardContent className="p-4">
                          <div className="space-y-3">
                            <div className="flex items-start justify-between">
                              <h4 className="font-medium text-primary">{idea.title}</h4>
                              <Button
                                size="sm"
                                onClick={() => handleSelectCreativeIdea(idea)}
                                className="ml-4"
                              >
                                Pilih Ini
                              </Button>
                            </div>

                            <div className="space-y-2">
                              <p className="text-sm">
                                <span className="font-medium">Konsep:</span> {idea.concept}
                              </p>
                              <p className="text-sm">
                                <span className="font-medium">Storyline:</span> {idea.storyline}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                <span className="font-medium">Mengapa efektif:</span> {idea.why_effective}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentStep('edit')}
                      className="flex-1"
                    >
                      Kembali Edit
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleGenerateCreativeIdeas}
                      disabled={generatingIdeas}
                      className="flex-1"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Ulang
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Tidak ada ide kreatif yang dihasilkan.</p>
                  <Button
                    onClick={handleGenerateCreativeIdeas}
                    className="mt-4"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Coba Lagi
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 5: Review & Generate */}
        {currentStep === 'enhance' && editedCreativeIdea && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium">Step 5: Review & Generate</h3>

            {/* Idea summary */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-5 space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Judul Ide</Label>
                  <Input
                    value={editedCreativeIdea.title || ''}
                    onChange={(e) => setEditedCreativeIdea((prev) => prev ? { ...prev, title: e.target.value } : prev)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Konsep</Label>
                  <Textarea
                    value={editedCreativeIdea.concept || ''}
                    onChange={(e) => setEditedCreativeIdea((prev) => prev ? { ...prev, concept: e.target.value } : prev)}
                    rows={2}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Storyline</Label>
                  <Textarea
                    value={editedCreativeIdea.storyline || ''}
                    onChange={(e) => setEditedCreativeIdea((prev) => prev ? { ...prev, storyline: e.target.value } : prev)}
                    rows={3}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Pesan Utama (opsional)</Label>
                  <Input
                    value={editedCreativeIdea.key_message || ''}
                    onChange={(e) => setEditedCreativeIdea((prev) => prev ? { ...prev, key_message: e.target.value } : prev)}
                    className="mt-1"
                    placeholder="Contoh: Kulit glowing dalam 7 hari"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Storyboard count */}
            <div className="flex items-center gap-4">
              <Label className="whitespace-nowrap text-sm">Jumlah Storyboard:</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={storyboardCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 1 && val <= 20) setStoryboardCount(val);
                }}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">maks. 20</span>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setCurrentStep('creative')} className="flex-1">
                Ganti Ide
              </Button>
              <Button onClick={handleFinalGenerate} disabled={loading} className="flex-1" size="lg">
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengirim...</>
                ) : (
                  <><CheckCircle className="w-4 h-4 mr-2" />Generate {storyboardCount} Storyboard</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Generating state */}
        {currentStep === 'generate' && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
              <h3 className="text-lg font-medium mb-2">Job dikirim ke worker</h3>
              <p className="text-muted-foreground text-sm">Mengalihkan ke halaman hasil...</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

