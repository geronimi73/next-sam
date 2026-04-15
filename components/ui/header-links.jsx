import { BookOpen, Github } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HeaderLinks({ githubUrl, blogUrl }) {
  if (!githubUrl && !blogUrl) return null;

  return (
    <div className="absolute top-4 right-4 flex gap-2">
      {blogUrl && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open(blogUrl, "_blank")}
        >
          <BookOpen className="w-4 h-4 mr-2" />
          Blog
        </Button>
      )}
      {githubUrl && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open(githubUrl, "_blank")}
        >
          <Github className="w-4 h-4 mr-2" />
          View on GitHub
        </Button>
      )}
    </div>
  );
}
