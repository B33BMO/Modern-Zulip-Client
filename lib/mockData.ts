async function loadStreams() {
    const res = await fetch("/api/zulip/streams");
    const data = await res.json();
    console.log(data);
  }
  
  async function loadMessages(stream: string, topic?: string) {
    const res = await fetch(`/api/zulip/messages?stream=${stream}${topic ? `&topic=${topic}` : ""}`);
    const data = await res.json();
    console.log(data);
  }
  
  async function sendMessage(stream: string, topic: string, content: string) {
    const res = await fetch("/api/zulip/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stream, topic, content }),
    });
    const data = await res.json();
    console.log(data);
  }
  