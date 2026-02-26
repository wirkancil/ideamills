'use client';

import { useState } from 'react';
import { Variation } from '../lib/types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Download, Copy, ChevronDown, ChevronUp, RefreshCw, Sparkles } from 'lucide-react';

interface ResultsDisplayProps {
  variations: Variation[];
  totalCount: number;
  themeCounts?: Record<string, number>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  generationId: string;
}

function DirectorsScriptSection({ 
  initialScript, 
  variationId, 
  generationId 
}: { 
  initialScript?: any, 
  variationId: string, 
  generationId: string 
}) {
  const [script, setScript] = useState(initialScript);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/generate-directors-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId, variationId }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Generation failed: ${res.status} ${res.statusText}`);
      }
      
      const data = await res.json();
      setScript(data.directors_script);
    } catch (error) {
      console.error(error);
      alert(`Gagal membuat naskah sutradara: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyScript = () => {
    if (!script) return;
    
    // Format structured data into readable text for copy
    let textToCopy = '';
    if (typeof script === 'string') {
      textToCopy = script;
    } else if (typeof script === 'object') {
      const formatValue = (val: any, indent = ''): string => {
        if (!val) return '';
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) return val.map(v => `- ${formatValue(v, indent)}`).join('\n' + indent);
        if (typeof val === 'object') {
          return Object.entries(val).map(([k, v]) => {
            const title = k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return `${indent}${title}:\n${formatValue(v, indent + '  ')}`;
          }).join('\n\n');
        }
        return String(val);
      };
      
      textToCopy = formatValue(script);
    }

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadScript = () => {
    if (!script) return;
    
    const blob = new Blob([JSON.stringify(script, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `directors-script-${variationId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderContent = (content: any): React.ReactNode => {
    if (!content) return null;
    
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      return (
        <ul className="list-disc pl-5 space-y-1 mt-1">
          {content.map((item, i) => (
            <li key={i} className="pl-1">
              {renderContent(item)}
            </li>
          ))}
        </ul>
      );
    }

    if (typeof content === 'object') {
      return (
        <div className="space-y-4">
          {Object.entries(content).map(([key, value]) => {
            if (!value) return null;
            // Format key: general_tone_mood -> General Tone Mood
            const title = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            return (
              <div key={key} className="space-y-1 border-l-2 border-primary/20 pl-3">
                <h4 className="font-semibold text-primary/80 text-xs uppercase tracking-wider">{title}</h4>
                <div className="text-muted-foreground">
                  {renderContent(value)}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    
    return String(content);
  };

  if (script) {
    return (
      <div className="space-y-2">
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyScript}>
            {copied ? (
              <>
                <Copy className="w-3 h-3 mr-2 text-green-500" />
                <span className="text-green-500">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 mr-2" />
                Copy
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadScript}>
            <Download className="w-3 h-3 mr-2" />
            Download
          </Button>
        </div>
        <div className="text-sm bg-muted/30 p-4 rounded-md whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
          {renderContent(script)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm bg-muted/30 p-4 rounded-md whitespace-pre-wrap font-mono leading-relaxed text-muted-foreground italic">
        Naskah lengkap belum tersedia untuk variasi ini.
      </div>
      <Button 
        onClick={handleGenerate} 
        disabled={loading}
        size="sm"
        variant="secondary"
      >
        {loading ? (
          <>
            <RefreshCw className="w-3 h-3 mr-2 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="w-3 h-3 mr-2" />
            Generate Director's Script
          </>
        )}
      </Button>
    </div>
  );
}

export function ResultsDisplay({ variations, totalCount, themeCounts, onLoadMore, hasMore, generationId }: ResultsDisplayProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  // Group variations by theme
  const groupedByTheme: Record<string, Variation[]> = {};
  variations.forEach((v) => {
    if (!groupedByTheme[v.theme]) {
      groupedByTheme[v.theme] = [];
    }
    groupedByTheme[v.theme].push(v);
  });

  // Get themes list sorted by count (descending)
  const themesList = Object.keys(groupedByTheme).sort((a, b) => {
    const countA = themeCounts?.[a] || groupedByTheme[a].length;
    const countB = themeCounts?.[b] || groupedByTheme[b].length;
    return countB - countA;
  });

  // Filter variations based on selected theme
  const displayVariations = selectedTheme 
    ? groupedByTheme[selectedTheme] || []
    : variations;

  const handleExportJSON = () => {
    const dataStr = JSON.stringify({ variations }, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ideamill-variations-${Date.now()}.json`;
    link.click();
  };

  const handleCopyJSON = () => {
    const dataStr = JSON.stringify({ variations }, null, 2);
    navigator.clipboard.writeText(dataStr);
    alert('JSON berhasil disalin ke clipboard!');
  };

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Hasil Generasi</h2>
          <p className="text-muted-foreground">
            {selectedTheme 
              ? `Tema: ${selectedTheme} - ${displayVariations.length} variasi`
              : `Menampilkan ${variations.length} dari ${totalCount} variasi`
            }
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCopyJSON}>
            <Copy className="w-4 h-4 mr-2" />
            Copy JSON
          </Button>
          <Button onClick={handleExportJSON}>
            <Download className="w-4 h-4 mr-2" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Theme Filter Tabs */}
      {themesList.length > 1 && (
        <div className="border-b">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedTheme === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTheme(null)}
            >
              Semua Tema ({totalCount})
            </Button>
            {themesList.map((theme) => {
              const count = themeCounts?.[theme] || groupedByTheme[theme].length;
              return (
                <Button
                  key={theme}
                  variant={selectedTheme === theme ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedTheme(theme)}
                  className="flex items-center gap-2"
                >
                  <span className="truncate max-w-[200px]" title={theme}>
                    {theme}
                  </span>
                  <Badge variant="secondary" className="ml-1">
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Theme Group Display */}
      {selectedTheme === null && themesList.length > 1 ? (
        <div className="space-y-6">
          {themesList.map((theme) => {
            const themeVariations = groupedByTheme[theme];
            const count = themeCounts?.[theme] || themeVariations.length;
            return (
              <div key={theme} className="space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b">
                  <h3 className="text-xl font-semibold">{theme}</h3>
                  <Badge variant="secondary">{count} Script</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTheme(theme)}
                    className="ml-auto"
                  >
                    Lihat Semua ({count})
                  </Button>
                </div>
                <div className="space-y-4">
                  {themeVariations.map((variation, index) => {
                    const globalIndex = variations.findIndex(v => v.id === variation.id);
                    return (
                      <Card key={variation.id} className="overflow-hidden">
                        <CardHeader className="bg-muted/50">
                          <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-3">
                              <Badge variant="secondary">{variation.id}</Badge>
                              <span className="text-sm text-muted-foreground">
                                Script {index + 1} dari {count}
                              </span>
                            </CardTitle>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleExpand(globalIndex)}
                            >
                              {expandedIndex === globalIndex ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </CardHeader>

                        {expandedIndex === globalIndex && (
                          <CardContent className="pt-6">
                            <Tabs defaultValue="scene-0" className="w-full">
                              <TabsList className="grid w-full grid-cols-5">
                                {variation.scenes.map((scene, sceneIdx) => (
                                  <TabsTrigger key={sceneIdx} value={`scene-${sceneIdx}`}>
                                    {scene.struktur}
                                  </TabsTrigger>
                                ))}
                                <TabsTrigger value="full-script">Naskah Lengkap</TabsTrigger>
                              </TabsList>

                              {variation.scenes.map((scene, sceneIdx) => (
                                <TabsContent key={sceneIdx} value={`scene-${sceneIdx}`} className="space-y-4">
                                  {/* Voiceover */}
                                  <div>
                                    <h4 className="font-semibold text-sm text-muted-foreground mb-2">
                                      Naskah VO (Bahasa Indonesia)
                                    </h4>
                                    <p className="text-sm bg-muted/30 p-4 rounded-md">
                                      {scene.naskah_vo}
                                    </p>
                                  </div>

                                  {/* Visual Idea */}
                                  <div>
                                    <h4 className="font-semibold text-sm text-muted-foreground mb-2">
                                      Ide Visual
                                    </h4>
                                    <p className="text-sm bg-muted/30 p-4 rounded-md">
                                      {scene.visual_idea}
                                    </p>
                                  </div>

                                  {/* Text to Image Prompt */}
                                  {scene.text_to_image && (
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground mb-2">
                                        📸 Text-to-Image Prompt
                                        {scene.text_to_image.includes('Image 1:') || scene.text_to_image.includes('|') ? (
                                          <Badge variant="outline" className="ml-2 text-xs">
                                            Multiple Images
                                          </Badge>
                                        ) : null}
                                      </h4>
                                      <div className="text-sm bg-primary/10 p-4 rounded-md">
                                        {/* Check if multiple images */}
                                        {scene.text_to_image.includes('Image 1:') || scene.text_to_image.includes('|') ? (
                                          <div className="space-y-3">
                                            {scene.text_to_image.split(/(?=Image \d+:)/).filter(Boolean).map((imgPrompt, idx) => (
                                              <div key={idx} className="border-l-2 border-primary pl-3">
                                                <div className="font-semibold text-xs text-primary mb-1">
                                                  {imgPrompt.match(/Image \d+:/)?.[0] || `Image ${idx + 1}`}
                                                </div>
                                                <p className="font-mono text-xs whitespace-pre-wrap">
                                                  {imgPrompt.replace(/Image \d+:\s*/, '').trim()}
                                                </p>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="font-mono text-xs whitespace-pre-wrap">
                                            {scene.text_to_image}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Image to Video Prompt */}
                                  {scene.image_to_video && (
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground mb-2">
                                        🎬 Image-to-Video Timeline (Per Detik)
                                      </h4>
                                      <div className="text-sm bg-secondary/50 p-4 rounded-md">
                                        {/* Check if formatted as timeline */}
                                        {scene.image_to_video.includes('0-1s:') || scene.image_to_video.includes('s:') ? (
                                          <div className="space-y-2">
                                            {scene.image_to_video.split('\n').filter(line => line.trim() && (line.includes('s:') || line.match(/^\d+-\d+s:/))).map((line, idx) => {
                                              const match = line.match(/^(\d+-\d+s:|^\d+s:)/);
                                              const time = match ? match[1] : '';
                                              const description = line.replace(/^\d+-\d+s:\s*|^\d+s:\s*/, '').trim();
                                              return (
                                                <div key={idx} className="flex gap-3 border-l-2 border-secondary pl-3">
                                                  <div className="font-bold text-xs text-secondary min-w-[60px] flex-shrink-0">
                                                    {time || `${idx}s:`}
                                                  </div>
                                                  <p className="font-mono text-xs flex-1 whitespace-pre-wrap">
                                                    {description || line}
                                                  </p>
                                                </div>
                                              );
                                            })}
                                            {scene.image_to_video.split('\n').filter(line => line.trim() && !line.includes('s:') && !line.match(/^\d+-\d+s:/)).length > 0 && (
                                              <div className="mt-3 pt-3 border-t">
                                                <p className="font-mono text-xs whitespace-pre-wrap">
                                                  {scene.image_to_video.split('\n').filter(line => line.trim() && !line.includes('s:') && !line.match(/^\d+-\d+s:/)).join('\n')}
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <p className="font-mono text-xs whitespace-pre-wrap">
                                            {scene.image_to_video}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </TabsContent>
                              ))}

                              <TabsContent value="full-script" className="space-y-4">
                                <div>
                                  <h4 className="font-semibold text-sm text-muted-foreground mb-2">
                                    Director's Script & Timeline
                                  </h4>
                                  <DirectorsScriptSection 
                                    initialScript={variation.directors_script}
                                    variationId={variation.id}
                                    generationId={generationId}
                                  />
                                </div>
                              </TabsContent>
                            </Tabs>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Original List View (when theme selected or single theme) */
        <div className="space-y-4">
          {displayVariations.map((variation, index) => {
            const globalIndex = variations.findIndex(v => v.id === variation.id);
            return (
          <Card key={variation.id} className="overflow-hidden">
            <CardHeader className="bg-muted/50">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-3">
                  <Badge variant="secondary">{variation.id}</Badge>
                  <span className="text-lg">{variation.theme}</span>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleExpand(globalIndex)}
                >
                  {expandedIndex === globalIndex ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </CardHeader>

            {expandedIndex === globalIndex && (
              <CardContent className="pt-6">
                <Tabs defaultValue="scene-0" className="w-full">
                  <TabsList className="grid w-full grid-cols-5">
                    {variation.scenes.map((scene, sceneIdx) => (
                      <TabsTrigger key={sceneIdx} value={`scene-${sceneIdx}`}>
                        {scene.struktur}
                      </TabsTrigger>
                    ))}
                    <TabsTrigger value="full-script">Naskah Lengkap</TabsTrigger>
                  </TabsList>

                  {variation.scenes.map((scene, sceneIdx) => (
                    <TabsContent key={sceneIdx} value={`scene-${sceneIdx}`} className="space-y-4">
                      {/* Voiceover */}
                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground mb-2">
                          Naskah VO (Bahasa Indonesia)
                        </h4>
                        <p className="text-sm bg-muted/30 p-4 rounded-md">
                          {scene.naskah_vo}
                        </p>
                      </div>

                      {/* Visual Idea */}
                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground mb-2">
                          Ide Visual
                        </h4>
                        <p className="text-sm bg-muted/30 p-4 rounded-md">
                          {scene.visual_idea}
                        </p>
                      </div>

                      {/* Text to Image Prompt */}
                      {scene.text_to_image && (
                        <div>
                          <h4 className="font-semibold text-sm text-muted-foreground mb-2">
                            📸 Text-to-Image Prompt
                            {scene.text_to_image.includes('Image 1:') || scene.text_to_image.includes('|') ? (
                              <Badge variant="outline" className="ml-2 text-xs">
                                Multiple Images
                              </Badge>
                            ) : null}
                          </h4>
                          <div className="text-sm bg-primary/10 p-4 rounded-md">
                            {/* Check if multiple images */}
                            {scene.text_to_image.includes('Image 1:') || scene.text_to_image.includes('|') ? (
                              <div className="space-y-3">
                                {scene.text_to_image.split(/(?=Image \d+:)/).filter(Boolean).map((imgPrompt, idx) => (
                                  <div key={idx} className="border-l-2 border-primary pl-3">
                                    <div className="font-semibold text-xs text-primary mb-1">
                                      {imgPrompt.match(/Image \d+:/)?.[0] || `Image ${idx + 1}`}
                                    </div>
                                    <p className="font-mono text-xs whitespace-pre-wrap">
                                      {imgPrompt.replace(/Image \d+:\s*/, '').trim()}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="font-mono text-xs whitespace-pre-wrap">
                                {scene.text_to_image}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Image to Video Prompt */}
                      {scene.image_to_video && (
                        <div>
                          <h4 className="font-semibold text-sm text-muted-foreground mb-2">
                            🎬 Image-to-Video Timeline (Per Detik)
                          </h4>
                          <div className="text-sm bg-secondary/50 p-4 rounded-md">
                            {/* Check if formatted as timeline */}
                            {scene.image_to_video.includes('0-1s:') || scene.image_to_video.includes('s:') ? (
                              <div className="space-y-2">
                                {scene.image_to_video.split('\n').filter(line => line.trim() && (line.includes('s:') || line.match(/^\d+-\d+s:/))).map((line, idx) => {
                                  const match = line.match(/^(\d+-\d+s:|^\d+s:)/);
                                  const time = match ? match[1] : '';
                                  const description = line.replace(/^\d+-\d+s:\s*|^\d+s:\s*/, '').trim();
                                  return (
                                    <div key={idx} className="flex gap-3 border-l-2 border-secondary pl-3">
                                      <div className="font-bold text-xs text-secondary min-w-[60px] flex-shrink-0">
                                        {time || `${idx}s:`}
                                      </div>
                                      <p className="font-mono text-xs flex-1 whitespace-pre-wrap">
                                        {description || line}
                                      </p>
                                    </div>
                                  );
                                })}
                                {scene.image_to_video.split('\n').filter(line => line.trim() && !line.includes('s:') && !line.match(/^\d+-\d+s:/)).length > 0 && (
                                  <div className="mt-3 pt-3 border-t">
                                    <p className="font-mono text-xs whitespace-pre-wrap">
                                      {scene.image_to_video.split('\n').filter(line => line.trim() && !line.includes('s:') && !line.match(/^\d+-\d+s:/)).join('\n')}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="font-mono text-xs whitespace-pre-wrap">
                                {scene.image_to_video}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  ))}
                  <TabsContent value="full-script" className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-sm text-muted-foreground mb-2">
                        Director's Script & Timeline
                      </h4>
                      <DirectorsScriptSection 
                        initialScript={variation.directors_script}
                        variationId={variation.id}
                        generationId={generationId}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            )}
          </Card>
            );
          })}
        </div>
      )}

      {/* Load More Button */}
      {hasMore && onLoadMore && (
        <div className="flex justify-center pt-6">
          <Button variant="outline" size="lg" onClick={onLoadMore}>
            Muat Lebih Banyak
          </Button>
        </div>
      )}
    </div>
  );
}

