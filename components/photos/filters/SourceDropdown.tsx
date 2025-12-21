"use client";

import { useState } from "react";
import { Camera, ChevronDown, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface CameraOption {
  id: string;
  name: string;
}

interface UploadSessionOption {
  id: string;
  created_at: string;
  total_images: number;
}

interface SourceDropdownProps {
  cameras: CameraOption[];
  sessions: UploadSessionOption[];
  cameraId: string | null;
  uploadSessionId: string | null;
  onChange: (cameraId: string | null, uploadSessionId: string | null) => void;
}

export function SourceDropdown({
  cameras,
  sessions,
  cameraId,
  uploadSessionId,
  onChange,
}: SourceDropdownProps) {
  const [open, setOpen] = useState(false);

  const handleCameraSelect = (id: string | null) => {
    onChange(id, null);
    setOpen(false);
  };

  const handleSessionSelect = (id: string | null) => {
    onChange(null, id);
    setOpen(false);
  };

  const formatSessionDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getButtonLabel = (): string => {
    const activeCount = (cameraId ? 1 : 0) + (uploadSessionId ? 1 : 0);

    if (activeCount === 0) {
      return "Source";
    }

    if (activeCount === 2) {
      return "Source (2)";
    }

    if (cameraId) {
      const camera = cameras.find((c) => c.id === cameraId);
      return camera?.name || "Source";
    }

    if (uploadSessionId) {
      const session = sessions.find((s) => s.id === uploadSessionId);
      return session ? formatSessionDate(session.created_at) : "Source";
    }

    return "Source";
  };

  const isActive = cameraId !== null || uploadSessionId !== null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 text-xs gap-1.5",
            isActive && "border-copper bg-copper/10 text-copper hover:bg-copper/20"
          )}
        >
          <Package className="h-3.5 w-3.5" />
          {getButtonLabel()}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandList>
            {cameras.length > 0 && (
              <CommandGroup heading="Camera">
                <CommandItem
                  onSelect={() => handleCameraSelect(null)}
                  className={cn(
                    "gap-2",
                    cameraId === null && "bg-accent"
                  )}
                >
                  <Camera className="h-4 w-4 opacity-50" />
                  <span className="text-muted-foreground italic">Any Camera</span>
                </CommandItem>
                {cameras.map((camera) => (
                  <CommandItem
                    key={camera.id}
                    onSelect={() => handleCameraSelect(camera.id)}
                    className={cn(
                      "gap-2",
                      cameraId === camera.id && "bg-accent"
                    )}
                  >
                    <Camera className="h-4 w-4 opacity-50" />
                    <span>{camera.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {sessions.length > 0 && (
              <CommandGroup heading="Upload Session">
                <CommandItem
                  onSelect={() => handleSessionSelect(null)}
                  className={cn(
                    "gap-2",
                    uploadSessionId === null && "bg-accent"
                  )}
                >
                  <Package className="h-4 w-4 opacity-50" />
                  <span className="text-muted-foreground italic">Any Session</span>
                </CommandItem>
                {sessions.map((session) => (
                  <CommandItem
                    key={session.id}
                    onSelect={() => handleSessionSelect(session.id)}
                    className={cn(
                      "gap-2",
                      uploadSessionId === session.id && "bg-accent"
                    )}
                  >
                    <Package className="h-4 w-4 opacity-50" />
                    <div className="flex flex-col">
                      <span className="text-sm">
                        {formatSessionDate(session.created_at)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {session.total_images} {session.total_images === 1 ? "photo" : "photos"}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {cameras.length === 0 && sessions.length === 0 && (
              <CommandEmpty>No sources available.</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
