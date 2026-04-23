"use client";

import * as React from "react";
import { Check, ChevronsUpDown, User, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { searchUsersForDiscount } from "@/lib/services/discounts";

interface User {
  id: string;
  name: string;
  email: string;
}

interface UserMultiSelectProps {
  selectedUserIds: string[];
  onSelectionChange: (userIds: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function UserMultiSelect({
  selectedUserIds,
  onSelectionChange,
  disabled = false,
  placeholder = "Select users...",
  className,
}: UserMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedUsers, setSelectedUsers] = React.useState<User[]>([]);

  // Debounced search
  React.useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setLoading(true);
        try {
          const results = await searchUsersForDiscount(searchQuery, 20);
          setUsers(results);
        } catch (error) {
          console.error("Failed to search users:", error);
          setUsers([]);
        } finally {
          setLoading(false);
        }
      } else {
        setUsers([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch initial selected users on mount (for edit mode)
  React.useEffect(() => {
    const fetchInitialUsers = async () => {
      if (selectedUserIds.length === 0) {
        setSelectedUsers([]);
        return;
      }

      try {
        // Fetch users by searching for each ID
        const allResults: User[] = [];
        for (const id of selectedUserIds) {
          const results = await searchUsersForDiscount(id, 1);
          if (results.length > 0) {
            allResults.push(results[0]);
          }
        }
        setSelectedUsers(allResults);
      } catch (error) {
        console.error("Failed to fetch selected users:", error);
      }
    };

    // Only run on mount, not on every selection change
    fetchInitialUsers();
  }, []);

  const toggleUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      onSelectionChange(selectedUserIds.filter((id) => id !== userId));
    } else {
      // Find the user in the current search results
      const userToSelect = users.find((u) => u.id === userId);
      if (userToSelect) {
        // Add the full user object to selectedUsers
        setSelectedUsers([...selectedUsers, userToSelect]);
      }
      onSelectionChange([...selectedUserIds, userId]);
    }
  };

  const removeUser = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange(selectedUserIds.filter((id) => id !== userId));
    // Remove from selectedUsers state
    setSelectedUsers(selectedUsers.filter((u) => u.id !== userId));
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            {selectedUsers.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              <span className="truncate">
                {selectedUsers.length} user{selectedUsers.length !== 1 ? "s" : ""} selected
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command filter={() => 1}>
            <CommandInput
              placeholder="Search users by name or email..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              {loading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Searching...
                </div>
              ) : users.length === 0 ? (
                <CommandEmpty>
                  {searchQuery.trim().length < 2
                    ? "Type at least 2 characters to search"
                    : "No users found"}
                </CommandEmpty>
              ) : (
                <CommandGroup>
                  {users.map((user) => (
                    <CommandItem
                      key={user.id}
                      value={user.id}
                      onSelect={() => {
                        toggleUser(user.id);
                      }}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">{user.name}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </span>
                        </div>
                      </div>
                      {selectedUserIds.includes(user.id) && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected users badges */}
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedUsers.map((user) => (
            <Badge
              key={user.id}
              variant="secondary"
              className="gap-1 pr-1"
            >
              <span className="max-w-[150px] truncate">
                {user.name}
              </span>
              <button
                type="button"
                onClick={(e) => removeUser(user.id, e)}
                className="ml-1 rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
                disabled={disabled}
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
