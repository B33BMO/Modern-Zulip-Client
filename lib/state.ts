import { create } from "zustand";


export type UIState = {
selectedStreamId: string | null;
selectedTopicId: string | null;
setStream: (id: string) => void;
setTopic: (id: string) => void;
};


export const useUI = create<UIState>((set) => ({
selectedStreamId: "s1",
selectedTopicId: "t1",
setStream: (id) => set({ selectedStreamId: id, selectedTopicId: null }),
setTopic: (id) => set({ selectedTopicId: id }),
}));