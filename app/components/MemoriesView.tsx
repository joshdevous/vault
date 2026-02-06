"use client";

import { useState } from "react";
import { Occasion } from "@/types/models";

interface MemoriesViewProps {
  occasions: Occasion[];
  onCreateOccasion: (title: string) => Promise<void>;
  onUpdateOccasion: (id: string, title: string) => Promise<void>;
  onDeleteOccasion: (id: string) => Promise<void>;
  onCreateMemory: (occasionId: string, content: string) => Promise<void>;
  onUpdateMemory: (occasionId: string, memoryId: string, content: string) => Promise<void>;
  onDeleteMemory: (occasionId: string, memoryId: string) => Promise<void>;
}

export function MemoriesView({
  occasions,
  onCreateOccasion,
  onUpdateOccasion,
  onDeleteOccasion,
  onCreateMemory,
  onUpdateMemory,
  onDeleteMemory,
}: MemoriesViewProps) {
  const [expandedOccasions, setExpandedOccasions] = useState<Set<string>>(new Set());
  const [newOccasionTitle, setNewOccasionTitle] = useState("");
  const [isAddingOccasion, setIsAddingOccasion] = useState(false);
  const [editingOccasionId, setEditingOccasionId] = useState<string | null>(null);
  const [editingOccasionTitle, setEditingOccasionTitle] = useState("");
  const [newMemoryContent, setNewMemoryContent] = useState<Record<string, string>>({});
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryContent, setEditingMemoryContent] = useState("");

  const toggleExpand = (id: string) => {
    setExpandedOccasions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCreateOccasion = async () => {
    if (!newOccasionTitle.trim()) return;
    await onCreateOccasion(newOccasionTitle.trim());
    setNewOccasionTitle("");
    setIsAddingOccasion(false);
  };

  const handleUpdateOccasion = async (id: string) => {
    if (!editingOccasionTitle.trim()) return;
    await onUpdateOccasion(id, editingOccasionTitle.trim());
    setEditingOccasionId(null);
  };

  const handleCreateMemory = async (occasionId: string) => {
    const content = newMemoryContent[occasionId]?.trim();
    if (!content) return;
    await onCreateMemory(occasionId, content);
    setNewMemoryContent((prev) => ({ ...prev, [occasionId]: "" }));
  };

  const handleUpdateMemory = async (occasionId: string, memoryId: string) => {
    if (!editingMemoryContent.trim()) return;
    await onUpdateMemory(occasionId, memoryId, editingMemoryContent.trim());
    setEditingMemoryId(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center h-11 px-3 border-b border-[#2f2f2f] shrink-0">
        <div className="flex items-center gap-2 text-sm text-[#9b9b9b]">
          <span className="px-1.5 py-0.5">Memories</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-12 py-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-[#e3e3e3]">Memories</h1>
            <button
              onClick={() => setIsAddingOccasion(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#2f2f2f] hover:bg-[#3f3f3f] text-[#ebebeb] text-sm rounded-md transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Occasion
            </button>
          </div>

          {/* Add occasion input */}
          {isAddingOccasion && (
            <div className="mb-6 p-4 bg-[#252525] rounded-lg border border-[#3f3f3f]">
              <input
                type="text"
                placeholder="e.g., Amsterdam 2025, Festival 2025..."
                value={newOccasionTitle}
                onChange={(e) => setNewOccasionTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateOccasion();
                  if (e.key === "Escape") setIsAddingOccasion(false);
                }}
                autoFocus
                className="w-full bg-[#1a1a1a] text-[#ebebeb] text-sm px-3 py-2 rounded-md outline-none border border-[#3f3f3f] focus:border-[#5f5f5f] placeholder-[#6b6b6b]"
              />
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => setIsAddingOccasion(false)}
                  className="px-3 py-1.5 text-sm text-[#9b9b9b] hover:text-[#ebebeb] rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateOccasion}
                  disabled={!newOccasionTitle.trim()}
                  className="px-3 py-1.5 text-sm bg-[#4f4f4f] hover:bg-[#5f5f5f] disabled:bg-[#3f3f3f] disabled:text-[#6b6b6b] text-[#ebebeb] rounded-md transition-colors"
                >
                  Create
                </button>
              </div>
            </div>
          )}

          {/* Occasions list */}
          {occasions.length === 0 && !isAddingOccasion ? (
            <div className="text-center py-12">
              <p className="text-[#6b6b6b]">No occasions yet</p>
              <button
                onClick={() => setIsAddingOccasion(true)}
                className="mt-4 text-sm text-[#9b9b9b] hover:text-[#ebebeb] transition-colors"
              >
                Add your first occasion →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {occasions.map((occasion) => {
                const isExpanded = expandedOccasions.has(occasion.id);
                const isEditing = editingOccasionId === occasion.id;
                const memories = occasion.memories || [];

                return (
                  <div
                    key={occasion.id}
                    className="bg-[#252525] rounded-lg border border-[#3f3f3f] overflow-hidden"
                  >
                    {/* Occasion header */}
                    <div
                      className="flex items-center gap-3 p-4 cursor-pointer hover:bg-[#2a2a2a] transition-colors"
                      onClick={() => !isEditing && toggleExpand(occasion.id)}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(occasion.id);
                        }}
                        className="w-5 h-5 flex items-center justify-center text-[#6b6b6b] hover:text-[#ebebeb]"
                      >
                        <svg
                          className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                      </button>
                      
                      <span className="text-xl">{occasion.icon}</span>
                      
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingOccasionTitle}
                          onChange={(e) => setEditingOccasionTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleUpdateOccasion(occasion.id);
                            if (e.key === "Escape") setEditingOccasionId(null);
                          }}
                          onBlur={() => handleUpdateOccasion(occasion.id)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                          className="flex-1 bg-transparent text-[#ebebeb] text-lg font-medium outline-none"
                        />
                      ) : (
                        <span className="flex-1 text-lg font-medium text-[#ebebeb]">
                          {occasion.title}
                        </span>
                      )}
                      
                      <span className="text-sm text-[#6b6b6b]">
                        {memories.length} {memories.length === 1 ? "memory" : "memories"}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingOccasionId(occasion.id);
                            setEditingOccasionTitle(occasion.title);
                          }}
                          className="p-1.5 text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f] rounded transition-colors"
                          title="Rename"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Delete this occasion and all its memories?")) {
                              onDeleteOccasion(occasion.id);
                            }
                          }}
                          className="p-1.5 text-[#6b6b6b] hover:text-red-400 hover:bg-[#3f3f3f] rounded transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Memories */}
                    {isExpanded && (
                      <div className="border-t border-[#3f3f3f] p-4 space-y-3">
                        {memories.map((memory) => {
                          const isEditingMemory = editingMemoryId === memory.id;
                          
                          return (
                            <div
                              key={memory.id}
                              className="group flex items-start gap-3 p-3 bg-[#1a1a1a] rounded-lg"
                            >
                              {isEditingMemory ? (
                                <textarea
                                  value={editingMemoryContent}
                                  onChange={(e) => setEditingMemoryContent(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      handleUpdateMemory(occasion.id, memory.id);
                                    }
                                    if (e.key === "Escape") setEditingMemoryId(null);
                                  }}
                                  onBlur={() => handleUpdateMemory(occasion.id, memory.id)}
                                  autoFocus
                                  rows={3}
                                  className="flex-1 bg-transparent text-[#ebebeb] text-sm outline-none resize-none"
                                />
                              ) : (
                                <p className="flex-1 text-sm text-[#ebebeb] whitespace-pre-wrap">
                                  {memory.content}
                                </p>
                              )}
                              
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    setEditingMemoryId(memory.id);
                                    setEditingMemoryContent(memory.content);
                                  }}
                                  className="p-1 text-[#6b6b6b] hover:text-[#ebebeb] hover:bg-[#3f3f3f] rounded transition-colors"
                                  title="Edit"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => onDeleteMemory(occasion.id, memory.id)}
                                  className="p-1 text-[#6b6b6b] hover:text-red-400 hover:bg-[#3f3f3f] rounded transition-colors"
                                  title="Delete"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {/* Add memory input */}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Add a memory..."
                            value={newMemoryContent[occasion.id] || ""}
                            onChange={(e) => setNewMemoryContent((prev) => ({ ...prev, [occasion.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleCreateMemory(occasion.id);
                            }}
                            className="flex-1 bg-[#1a1a1a] text-[#ebebeb] text-sm px-3 py-2 rounded-md outline-none border border-[#3f3f3f] focus:border-[#5f5f5f] placeholder-[#6b6b6b]"
                          />
                          <button
                            onClick={() => handleCreateMemory(occasion.id)}
                            disabled={!newMemoryContent[occasion.id]?.trim()}
                            className="px-3 py-2 bg-[#3f3f3f] hover:bg-[#4f4f4f] disabled:bg-[#2f2f2f] disabled:text-[#6b6b6b] text-[#ebebeb] text-sm rounded-md transition-colors"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
