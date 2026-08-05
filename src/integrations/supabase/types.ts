export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      adhoc_sms_log: {
        Row: {
          booking_id: string
          campaign_key: string
          id: string
          phone: string | null
          response: string | null
          sent_at: string
          success: boolean
        }
        Insert: {
          booking_id: string
          campaign_key: string
          id?: string
          phone?: string | null
          response?: string | null
          sent_at?: string
          success?: boolean
        }
        Update: {
          booking_id?: string
          campaign_key?: string
          id?: string
          phone?: string | null
          response?: string | null
          sent_at?: string
          success?: boolean
        }
        Relationships: []
      }
      ai_caddy_actions: {
        Row: {
          args: Json | null
          created_at: string
          id: string
          result: Json | null
          status: string
          thread_id: string | null
          tool_name: string
          user_id: string
        }
        Insert: {
          args?: Json | null
          created_at?: string
          id?: string
          result?: Json | null
          status?: string
          thread_id?: string | null
          tool_name: string
          user_id: string
        }
        Update: {
          args?: Json | null
          created_at?: string
          id?: string
          result?: Json | null
          status?: string
          thread_id?: string | null
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_caddy_actions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_caddy_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_caddy_messages: {
        Row: {
          created_at: string
          id: string
          parts: Json
          role: string
          thread_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parts: Json
          role: string
          thread_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_caddy_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_caddy_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_caddy_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          members_only: boolean | null
          source_id: string | null
          source_type: string | null
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          members_only?: boolean | null
          source_id?: string | null
          source_type?: string | null
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          members_only?: boolean | null
          source_id?: string | null
          source_type?: string | null
          title?: string
        }
        Relationships: []
      }
      bar_tabs: {
        Row: {
          closed_at: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          id: string
          items: Json
          opened_by: string | null
          status: string
          subtotal: number
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          id?: string
          items?: Json
          opened_by?: string | null
          status?: string
          subtotal?: number
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          id?: string
          items?: Json
          opened_by?: string | null
          status?: string
          subtotal?: number
          updated_at?: string
        }
        Relationships: []
      }
      bay_blocks: {
        Row: {
          bay_id: string
          block_date: string
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          reason: string | null
          start_time: string
        }
        Insert: {
          bay_id: string
          block_date: string
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          reason?: string | null
          start_time: string
        }
        Update: {
          bay_id?: string
          block_date?: string
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          reason?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "bay_blocks_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
        ]
      }
      bay_commands: {
        Row: {
          bay_number: number
          command: string
          created_at: string
          created_by: string | null
          executed_at: string | null
          id: string
          status: string
        }
        Insert: {
          bay_number: number
          command: string
          created_at?: string
          created_by?: string | null
          executed_at?: string | null
          id?: string
          status?: string
        }
        Update: {
          bay_number?: number
          command?: string
          created_at?: string
          created_by?: string | null
          executed_at?: string | null
          id?: string
          status?: string
        }
        Relationships: []
      }
      bay_controller_logs: {
        Row: {
          app_version: string | null
          bay_number: number
          booking_id: string | null
          created_at: string
          details: Json | null
          event_level: string
          event_type: string
          id: string
          message: string
        }
        Insert: {
          app_version?: string | null
          bay_number: number
          booking_id?: string | null
          created_at?: string
          details?: Json | null
          event_level?: string
          event_type: string
          id?: string
          message: string
        }
        Update: {
          app_version?: string | null
          bay_number?: number
          booking_id?: string | null
          created_at?: string
          details?: Json | null
          event_level?: string
          event_type?: string
          id?: string
          message?: string
        }
        Relationships: []
      }
      bay_devices: {
        Row: {
          app_version: string | null
          bay_id: string
          control_mode: string
          created_at: string
          id: string
          is_online: boolean
          last_seen: string | null
          obs_ws_password: string | null
          obs_ws_url: string | null
          plug_status: string | null
          updated_at: string
        }
        Insert: {
          app_version?: string | null
          bay_id: string
          control_mode?: string
          created_at?: string
          id?: string
          is_online?: boolean
          last_seen?: string | null
          obs_ws_password?: string | null
          obs_ws_url?: string | null
          plug_status?: string | null
          updated_at?: string
        }
        Update: {
          app_version?: string | null
          bay_id?: string
          control_mode?: string
          created_at?: string
          id?: string
          is_online?: boolean
          last_seen?: string | null
          obs_ws_password?: string | null
          obs_ws_url?: string | null
          plug_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bay_devices_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: true
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
        ]
      }
      bay_orders: {
        Row: {
          bay_number: number
          created_at: string
          id: string
          items: Json
          processed_at: string | null
          processed_by: string | null
          status: string
          total: number
        }
        Insert: {
          bay_number: number
          created_at?: string
          id?: string
          items: Json
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          total: number
        }
        Update: {
          bay_number?: number
          created_at?: string
          id?: string
          items?: Json
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          total?: number
        }
        Relationships: []
      }
      bays: {
        Row: {
          bay_number: number
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          bay_number: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          bay_number?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      booking_notification_log: {
        Row: {
          attempt_count: number
          booking_id: string
          created_at: string
          email_sent: boolean
          gate_sms_sent: boolean
          id: string
          last_error: string | null
          last_response: Json | null
          notification_type: string
          sms_sent: boolean
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          booking_id: string
          created_at?: string
          email_sent?: boolean
          gate_sms_sent?: boolean
          id?: string
          last_error?: string | null
          last_response?: Json | null
          notification_type: string
          sms_sent?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          booking_id?: string
          created_at?: string
          email_sent?: boolean
          gate_sms_sent?: boolean
          id?: string
          last_error?: string | null
          last_response?: Json | null
          notification_type?: string
          sms_sent?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_notification_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          bay_id: string
          booking_date: string
          cancellation_reason: string | null
          created_at: string
          duration_hours: number
          end_time: string
          hourly_rate: number
          id: string
          notes: string | null
          payment_method: string | null
          player_count: number
          start_time: string
          status: string
          stripe_payment_intent_id: string | null
          total_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bay_id: string
          booking_date: string
          cancellation_reason?: string | null
          created_at?: string
          duration_hours: number
          end_time: string
          hourly_rate: number
          id?: string
          notes?: string | null
          payment_method?: string | null
          player_count?: number
          start_time: string
          status?: string
          stripe_payment_intent_id?: string | null
          total_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bay_id?: string
          booking_date?: string
          cancellation_reason?: string | null
          created_at?: string
          duration_hours?: number
          end_time?: string
          hourly_rate?: number
          id?: string
          notes?: string | null
          payment_method?: string | null
          player_count?: number
          start_time?: string
          status?: string
          stripe_payment_intent_id?: string | null
          total_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
        ]
      }
      clubhouse_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubhouse_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "clubhouse_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      clubhouse_posts: {
        Row: {
          content: string
          created_at: string
          id: string
          image_url: string | null
          title: string
          updated_at: string
          upvote_count: number
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          title: string
          updated_at?: string
          upvote_count?: number
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          title?: string
          updated_at?: string
          upvote_count?: number
          user_id?: string
        }
        Relationships: []
      }
      clubhouse_upvotes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubhouse_upvotes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "clubhouse_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_partner_board: {
        Row: {
          contact_info: string
          created_at: string
          handicap: number | null
          id: string
          is_active: boolean
          player_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_info: string
          created_at?: string
          handicap?: number | null
          id?: string
          is_active?: boolean
          player_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_info?: string
          created_at?: string
          handicap?: number | null
          id?: string
          is_active?: boolean
          player_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comp_survey_responses: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          preferred_day: string | null
          preferred_entry_fee: string | null
          preferred_time: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          preferred_day?: string | null
          preferred_entry_fee?: string | null
          preferred_time?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          preferred_day?: string | null
          preferred_entry_fee?: string | null
          preferred_time?: string | null
        }
        Relationships: []
      }
      deposit_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          related_booking_id: string | null
          related_gift_card_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          related_booking_id?: string | null
          related_gift_card_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          related_booking_id?: string | null
          related_gift_card_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_transactions_related_booking_id_fkey"
            columns: ["related_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_transactions_related_gift_card_id_fkey"
            columns: ["related_gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      door_access_settings: {
        Row: {
          append_hash: boolean
          code_length: number
          created_at: string
          enabled: boolean
          fixed_code: string
          id: string
          mode: string
          provider: string
          tuya_device_id: string | null
          tuya_region: string
          updated_at: string
          valid_from_minutes_before: number
          valid_until_minutes_after: number
        }
        Insert: {
          append_hash?: boolean
          code_length?: number
          created_at?: string
          enabled?: boolean
          fixed_code?: string
          id?: string
          mode?: string
          provider?: string
          tuya_device_id?: string | null
          tuya_region?: string
          updated_at?: string
          valid_from_minutes_before?: number
          valid_until_minutes_after?: number
        }
        Update: {
          append_hash?: boolean
          code_length?: number
          created_at?: string
          enabled?: boolean
          fixed_code?: string
          id?: string
          mode?: string
          provider?: string
          tuya_device_id?: string | null
          tuya_region?: string
          updated_at?: string
          valid_from_minutes_before?: number
          valid_until_minutes_after?: number
        }
        Relationships: []
      }
      door_code_events: {
        Row: {
          booking_id: string | null
          created_at: string
          detail: Json | null
          door_code_id: string | null
          event_type: string
          id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          detail?: Json | null
          door_code_id?: string | null
          event_type: string
          id?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          detail?: Json | null
          door_code_id?: string | null
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "door_code_events_door_code_id_fkey"
            columns: ["door_code_id"]
            isOneToOne: false
            referencedRelation: "door_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      door_codes: {
        Row: {
          booking_id: string | null
          code: string
          created_at: string
          id: string
          is_permanent: boolean
          label: string | null
          last_error: string | null
          provider: string
          provider_ref: string | null
          scope: string
          slot_index: number | null
          status: string
          updated_at: string
          user_id: string | null
          valid_from: string
          valid_until: string
        }
        Insert: {
          booking_id?: string | null
          code: string
          created_at?: string
          id?: string
          is_permanent?: boolean
          label?: string | null
          last_error?: string | null
          provider?: string
          provider_ref?: string | null
          scope?: string
          slot_index?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
          valid_from: string
          valid_until: string
        }
        Update: {
          booking_id?: string | null
          code?: string
          created_at?: string
          id?: string
          is_permanent?: boolean
          label?: string | null
          last_error?: string | null
          provider?: string
          provider_ref?: string | null
          scope?: string
          slot_index?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "door_codes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      email_layout: {
        Row: {
          footer_html: string
          header_html: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          footer_html: string
          header_html: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          footer_html?: string
          header_html?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          created_at: string
          description: string | null
          html_content: string | null
          id: string
          is_active: boolean
          name: string
          subject: string | null
          template_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          html_content?: string | null
          id?: string
          is_active?: boolean
          name: string
          subject?: string | null
          template_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          html_content?: string | null
          id?: string
          is_active?: boolean
          name?: string
          subject?: string | null
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback_emails_sent: {
        Row: {
          email: string
          feedback_received: boolean
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          email: string
          feedback_received?: boolean
          id?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          email?: string
          feedback_received?: boolean
          id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feedback_responses: {
        Row: {
          comment: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          score: string
          token: string
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          score: string
          token: string
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          score?: string
          token?: string
          user_id?: string | null
        }
        Relationships: []
      }
      gift_cards: {
        Row: {
          amount: number
          created_at: string
          delivery_method: string
          id: string
          issued_at: string
          issued_by: string | null
          paid_at: string | null
          personal_message: string | null
          recipient_email: string
          recipient_name: string | null
          redeemed_at: string | null
          redeemed_by_user_id: string | null
          redemption_code: string | null
          scheduled_for: string | null
          sender_email: string | null
          sender_name: string | null
          sent_at: string | null
          shopify_line_item_id: string | null
          shopify_order_id: string | null
          shopify_order_number: string | null
          source: string
          status: string
          stripe_session_id: string | null
          token: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          delivery_method?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          paid_at?: string | null
          personal_message?: string | null
          recipient_email: string
          recipient_name?: string | null
          redeemed_at?: string | null
          redeemed_by_user_id?: string | null
          redemption_code?: string | null
          scheduled_for?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sent_at?: string | null
          shopify_line_item_id?: string | null
          shopify_order_id?: string | null
          shopify_order_number?: string | null
          source?: string
          status?: string
          stripe_session_id?: string | null
          token?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          delivery_method?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          paid_at?: string | null
          personal_message?: string | null
          recipient_email?: string
          recipient_name?: string | null
          redeemed_at?: string | null
          redeemed_by_user_id?: string | null
          redemption_code?: string | null
          scheduled_for?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sent_at?: string | null
          shopify_line_item_id?: string | null
          shopify_order_id?: string | null
          shopify_order_number?: string | null
          source?: string
          status?: string
          stripe_session_id?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      google_review_rewards: {
        Row: {
          approved_at: string
          approved_by: string | null
          created_at: string
          credit_amount: number
          credit_issued: boolean
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          credit_amount?: number
          credit_issued?: boolean
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          credit_amount?: number
          credit_issued?: boolean
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      highlight_clips: {
        Row: {
          approved_at: string
          approved_by: string | null
          created_at: string
          duration_seconds: number | null
          hole_number: number | null
          id: string
          notes: string | null
          player_name: string | null
          recording_hole_id: string | null
          storage_path: string
          tags: string[]
          tournament_name: string | null
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          duration_seconds?: number | null
          hole_number?: number | null
          id?: string
          notes?: string | null
          player_name?: string | null
          recording_hole_id?: string | null
          storage_path: string
          tags?: string[]
          tournament_name?: string | null
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          duration_seconds?: number | null
          hole_number?: number | null
          id?: string
          notes?: string | null
          player_name?: string | null
          recording_hole_id?: string | null
          storage_path?: string
          tags?: string[]
          tournament_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "highlight_clips_recording_hole_id_fkey"
            columns: ["recording_hole_id"]
            isOneToOne: false
            referencedRelation: "recording_holes"
            referencedColumns: ["id"]
          },
        ]
      }
      highlight_events: {
        Row: {
          created_at: string
          id: string
          metric_unit: string | null
          metric_value: number | null
          recording_hole_id: string
          rule_key: string
          shot_index: number | null
          tag_emoji: string | null
          tag_label: string
        }
        Insert: {
          created_at?: string
          id?: string
          metric_unit?: string | null
          metric_value?: number | null
          recording_hole_id: string
          rule_key: string
          shot_index?: number | null
          tag_emoji?: string | null
          tag_label: string
        }
        Update: {
          created_at?: string
          id?: string
          metric_unit?: string | null
          metric_value?: number | null
          recording_hole_id?: string
          rule_key?: string
          shot_index?: number | null
          tag_emoji?: string | null
          tag_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "highlight_events_recording_hole_id_fkey"
            columns: ["recording_hole_id"]
            isOneToOne: false
            referencedRelation: "recording_holes"
            referencedColumns: ["id"]
          },
        ]
      }
      local_comp_players: {
        Row: {
          created_at: string
          handicap: number
          id: string
          name: string
          name_normalized: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          handicap?: number
          id?: string
          name: string
          name_normalized: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          handicap?: number
          id?: string
          name?: string
          name_normalized?: string
          updated_at?: string
        }
        Relationships: []
      }
      local_comp_saved_teams: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          player1_handicap: number
          player1_local_hcp: number
          player1_name: string
          player2_handicap: number
          player2_local_hcp: number
          player2_name: string
          team_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          player1_handicap?: number
          player1_local_hcp?: number
          player1_name: string
          player2_handicap?: number
          player2_local_hcp?: number
          player2_name: string
          team_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          player1_handicap?: number
          player1_local_hcp?: number
          player1_name?: string
          player2_handicap?: number
          player2_local_hcp?: number
          player2_name?: string
          team_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      local_comp_settings: {
        Row: {
          created_at: string
          default_entry_fee: number
          default_format: string
          hub_highlights_enabled: boolean
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_entry_fee?: number
          default_format?: string
          hub_highlights_enabled?: boolean
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_entry_fee?: number
          default_format?: string
          hub_highlights_enabled?: boolean
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      local_comp_teams: {
        Row: {
          combined_handicap: number
          competition_id: string
          created_at: string
          gross_score: number | null
          id: string
          net_score: number | null
          paid: boolean
          player1_handicap: number
          player1_name: string
          player1_paid: boolean
          player2_handicap: number
          player2_name: string
          player2_paid: boolean
          position: number | null
          team_name: string
        }
        Insert: {
          combined_handicap?: number
          competition_id: string
          created_at?: string
          gross_score?: number | null
          id?: string
          net_score?: number | null
          paid?: boolean
          player1_handicap?: number
          player1_name: string
          player1_paid?: boolean
          player2_handicap?: number
          player2_name: string
          player2_paid?: boolean
          position?: number | null
          team_name: string
        }
        Update: {
          combined_handicap?: number
          competition_id?: string
          created_at?: string
          gross_score?: number | null
          id?: string
          net_score?: number | null
          paid?: boolean
          player1_handicap?: number
          player1_name?: string
          player1_paid?: boolean
          player2_handicap?: number
          player2_name?: string
          player2_paid?: boolean
          position?: number | null
          team_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_comp_teams_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "local_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      local_competitions: {
        Row: {
          course_id: number | null
          course_name: string | null
          created_at: string
          created_by: string | null
          date: string
          entry_fee: number
          fairway_firmness: string | null
          format: string
          green_firmness: string | null
          green_speed: number | null
          id: string
          name: string
          pins: string | null
          start_time: string | null
          status: string
          tees: string | null
          wind: string | null
        }
        Insert: {
          course_id?: number | null
          course_name?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          entry_fee?: number
          fairway_firmness?: string | null
          format?: string
          green_firmness?: string | null
          green_speed?: number | null
          id?: string
          name: string
          pins?: string | null
          start_time?: string | null
          status?: string
          tees?: string | null
          wind?: string | null
        }
        Update: {
          course_id?: number | null
          course_name?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          entry_fee?: number
          fairway_firmness?: string | null
          format?: string
          green_firmness?: string | null
          green_speed?: number | null
          id?: string
          name?: string
          pins?: string | null
          start_time?: string | null
          status?: string
          tees?: string | null
          wind?: string | null
        }
        Relationships: []
      }
      local_hcp_adjustments: {
        Row: {
          competition_id: string | null
          competition_name: string | null
          created_at: string
          delta: number
          hcp_after: number | null
          hcp_before: number | null
          id: string
          player_name: string
          player_name_normalized: string
          position: number | null
          reason: string
        }
        Insert: {
          competition_id?: string | null
          competition_name?: string | null
          created_at?: string
          delta: number
          hcp_after?: number | null
          hcp_before?: number | null
          id?: string
          player_name: string
          player_name_normalized: string
          position?: number | null
          reason: string
        }
        Update: {
          competition_id?: string | null
          competition_name?: string | null
          created_at?: string
          delta?: number
          hcp_after?: number | null
          hcp_before?: number | null
          id?: string
          player_name?: string
          player_name_normalized?: string
          position?: number | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_hcp_adjustments_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "local_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_credits_issued: {
        Row: {
          created_at: string
          credit_amount: number
          id: string
          milestone_number: number
          reminder_14d_sent_at: string | null
          reminder_30d_sent_at: string | null
          total_bookings_at_issue: number
          user_id: string
        }
        Insert: {
          created_at?: string
          credit_amount: number
          id?: string
          milestone_number: number
          reminder_14d_sent_at?: string | null
          reminder_30d_sent_at?: string | null
          total_bookings_at_issue: number
          user_id: string
        }
        Update: {
          created_at?: string
          credit_amount?: number
          id?: string
          milestone_number?: number
          reminder_14d_sent_at?: string | null
          reminder_30d_sent_at?: string | null
          total_bookings_at_issue?: number
          user_id?: string
        }
        Relationships: []
      }
      loyalty_promo_settings: {
        Row: {
          created_at: string
          credit_amount: number
          enabled: boolean
          id: string
          updated_at: string
          visit_threshold: number
        }
        Insert: {
          created_at?: string
          credit_amount?: number
          enabled?: boolean
          id?: string
          updated_at?: string
          visit_threshold?: number
        }
        Update: {
          created_at?: string
          credit_amount?: number
          enabled?: boolean
          id?: string
          updated_at?: string
          visit_threshold?: number
        }
        Relationships: []
      }
      marketing_campaigns: {
        Row: {
          clicks: number | null
          created_at: string
          created_by: string | null
          html_content: string
          id: string
          name: string
          opens: number | null
          recipient_count: number | null
          recipient_filter: Json | null
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          clicks?: number | null
          created_at?: string
          created_by?: string | null
          html_content: string
          id?: string
          name: string
          opens?: number | null
          recipient_count?: number | null
          recipient_filter?: Json | null
          sent_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          clicks?: number | null
          created_at?: string
          created_by?: string | null
          html_content?: string
          id?: string
          name?: string
          opens?: number | null
          recipient_count?: number | null
          recipient_filter?: Json | null
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_templates: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          html_content: string
          id: string
          is_active: boolean | null
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          html_content: string
          id?: string
          is_active?: boolean | null
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          html_content?: string
          id?: string
          is_active?: boolean | null
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_unsubscribes: {
        Row: {
          email: string
          id: string
          reason: string | null
          unsubscribed_at: string
        }
        Insert: {
          email: string
          id?: string
          reason?: string | null
          unsubscribed_at?: string
        }
        Update: {
          email?: string
          id?: string
          reason?: string | null
          unsubscribed_at?: string
        }
        Relationships: []
      }
      membership_changes: {
        Row: {
          changed_at: string
          id: string
          new_tier: string
          previous_tier: string
          user_id: string
        }
        Insert: {
          changed_at?: string
          id?: string
          new_tier: string
          previous_tier: string
          user_id: string
        }
        Update: {
          changed_at?: string
          id?: string
          new_tier?: string
          previous_tier?: string
          user_id?: string
        }
        Relationships: []
      }
      membership_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          paid_at: string
          period_end: string | null
          period_start: string | null
          stripe_customer_id: string
          stripe_invoice_id: string
          tier: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          paid_at?: string
          period_end?: string | null
          period_start?: string | null
          stripe_customer_id: string
          stripe_invoice_id: string
          tier: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          paid_at?: string
          period_end?: string | null
          period_start?: string | null
          stripe_customer_id?: string
          stripe_invoice_id?: string
          tier?: string
          user_id?: string
        }
        Relationships: []
      }
      operating_hours: {
        Row: {
          close_time: string
          created_at: string
          day_of_week: number
          id: string
          is_open: boolean
          open_time: string
          updated_at: string
        }
        Insert: {
          close_time?: string
          created_at?: string
          day_of_week: number
          id?: string
          is_open?: boolean
          open_time?: string
          updated_at?: string
        }
        Update: {
          close_time?: string
          created_at?: string
          day_of_week?: number
          id?: string
          is_open?: boolean
          open_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      pack_lots: {
        Row: {
          created_at: string
          expires_at: string | null
          hours_remaining: number
          hours_total: number
          id: string
          is_gift: boolean
          price_paid: number
          product_id: string | null
          product_name: string
          purchased_at: string | null
          purchaser_email: string | null
          purchaser_name: string | null
          purchaser_user_id: string | null
          recipient_name: string | null
          redeemed_at: string | null
          redemption_code: string | null
          reminder_sent_at: string | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          updated_at: string
          user_id: string | null
          validity_days: number
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          hours_remaining?: number
          hours_total: number
          id?: string
          is_gift?: boolean
          price_paid?: number
          product_id?: string | null
          product_name: string
          purchased_at?: string | null
          purchaser_email?: string | null
          purchaser_name?: string | null
          purchaser_user_id?: string | null
          recipient_name?: string | null
          redeemed_at?: string | null
          redemption_code?: string | null
          reminder_sent_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string | null
          validity_days?: number
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          hours_remaining?: number
          hours_total?: number
          id?: string
          is_gift?: boolean
          price_paid?: number
          product_id?: string | null
          product_name?: string
          purchased_at?: string | null
          purchaser_email?: string | null
          purchaser_name?: string | null
          purchaser_user_id?: string | null
          recipient_name?: string | null
          redeemed_at?: string | null
          redemption_code?: string | null
          reminder_sent_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string | null
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "pack_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pack_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pack_products: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          hours: number
          id: string
          is_active: boolean
          name: string
          price: number
          updated_at: string
          validity_days: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          hours: number
          id?: string
          is_active?: boolean
          name: string
          price: number
          updated_at?: string
          validity_days?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          hours?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          updated_at?: string
          validity_days?: number
        }
        Relationships: []
      }
      pack_transactions: {
        Row: {
          balance_after: number
          created_at: string
          description: string | null
          hours: number
          id: string
          lot_id: string | null
          related_booking_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          balance_after?: number
          created_at?: string
          description?: string | null
          hours: number
          id?: string
          lot_id?: string | null
          related_booking_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          description?: string | null
          hours?: number
          id?: string
          lot_id?: string | null
          related_booking_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pack_transactions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "pack_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pack_transactions_related_booking_id_fkey"
            columns: ["related_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_products: {
        Row: {
          created_at: string
          display_order: number | null
          family: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          family?: string | null
          id?: string
          is_active?: boolean
          name: string
          price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          family?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_transactions: {
        Row: {
          booking_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          items: Json
          payment_method: string
          status: string
          stripe_payment_intent_id: string | null
          subtotal: number
          total: number
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          items: Json
          payment_method: string
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal: number
          total: number
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          items?: Json
          payment_method?: string
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal?: number
          total?: number
        }
        Relationships: []
      }
      pricing_config: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          display_order: number
          features: Json
          grants_league_access: boolean
          grants_range_access: boolean
          hourly_rate: number
          id: string
          is_default: boolean
          is_subscription: boolean
          off_peak_hourly_rate: number | null
          restricted_to_off_peak: boolean
          restrictions: string | null
          single_bay_at_peak: boolean
          stripe_price_id: string | null
          stripe_product_id: string | null
          tier: string
          updated_at: string
          weekly_subscription_price: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          display_order?: number
          features?: Json
          grants_league_access?: boolean
          grants_range_access?: boolean
          hourly_rate: number
          id?: string
          is_default?: boolean
          is_subscription?: boolean
          off_peak_hourly_rate?: number | null
          restricted_to_off_peak?: boolean
          restrictions?: string | null
          single_bay_at_peak?: boolean
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          tier: string
          updated_at?: string
          weekly_subscription_price?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          display_order?: number
          features?: Json
          grants_league_access?: boolean
          grants_range_access?: boolean
          hourly_rate?: number
          id?: string
          is_default?: boolean
          is_subscription?: boolean
          off_peak_hourly_rate?: number | null
          restricted_to_off_peak?: boolean
          restrictions?: string | null
          single_bay_at_peak?: boolean
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          tier?: string
          updated_at?: string
          weekly_subscription_price?: number | null
        }
        Relationships: []
      }
      pricing_specials: {
        Row: {
          applies_off_peak: boolean
          applies_peak: boolean
          created_at: string
          display_order: number
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          applies_off_peak?: boolean
          applies_peak?: boolean
          created_at?: string
          display_order?: number
          duration_minutes: number
          id?: string
          is_active?: boolean
          name: string
          price: number
          updated_at?: string
        }
        Update: {
          applies_off_peak?: boolean
          applies_peak?: boolean
          created_at?: string
          display_order?: number
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          booking_flag_enabled: boolean
          created_at: string
          custom_billing: boolean
          custom_hourly_rate: number | null
          custom_segment: string | null
          deposit_balance: number
          display_name: string | null
          email: string
          first_name: string
          first_session_promo_sent: string | null
          id: string
          last_name: string
          marketing_opt_out: boolean | null
          membership_on_hold: boolean
          membership_tier: string
          payment_failed_at: string | null
          phone: string | null
          referral_source: string | null
          sgt_user_id: number | null
          terms_accepted_at: string | null
          terms_version_accepted: string | null
          total_bookings: number
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_flag_enabled?: boolean
          created_at?: string
          custom_billing?: boolean
          custom_hourly_rate?: number | null
          custom_segment?: string | null
          deposit_balance?: number
          display_name?: string | null
          email: string
          first_name: string
          first_session_promo_sent?: string | null
          id?: string
          last_name: string
          marketing_opt_out?: boolean | null
          membership_on_hold?: boolean
          membership_tier?: string
          payment_failed_at?: string | null
          phone?: string | null
          referral_source?: string | null
          sgt_user_id?: number | null
          terms_accepted_at?: string | null
          terms_version_accepted?: string | null
          total_bookings?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_flag_enabled?: boolean
          created_at?: string
          custom_billing?: boolean
          custom_hourly_rate?: number | null
          custom_segment?: string | null
          deposit_balance?: number
          display_name?: string | null
          email?: string
          first_name?: string
          first_session_promo_sent?: string | null
          id?: string
          last_name?: string
          marketing_opt_out?: boolean | null
          membership_on_hold?: boolean
          membership_tier?: string
          payment_failed_at?: string | null
          phone?: string | null
          referral_source?: string | null
          sgt_user_id?: number | null
          terms_accepted_at?: string | null
          terms_version_accepted?: string | null
          total_bookings?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      public_holidays: {
        Row: {
          created_at: string
          created_by: string | null
          holiday_date: string
          id: string
          name: string
          surcharge_percent: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          holiday_date: string
          id?: string
          name: string
          surcharge_percent?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          holiday_date?: string
          id?: string
          name?: string
          surcharge_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      range_sessions: {
        Row: {
          bay_id: string | null
          booking_id: string | null
          created_at: string
          csv_path: string | null
          duration_minutes: number | null
          ended_at: string | null
          id: string
          session_date: string
          shot_count: number
          source_filename: string | null
          started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bay_id?: string | null
          booking_id?: string | null
          created_at?: string
          csv_path?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          session_date?: string
          shot_count?: number
          source_filename?: string | null
          started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bay_id?: string | null
          booking_id?: string | null
          created_at?: string
          csv_path?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          session_date?: string
          shot_count?: number
          source_filename?: string | null
          started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "range_sessions_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "range_sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      range_shots: {
        Row: {
          angle_of_attack: number | null
          apex_height: number | null
          back_spin: number | null
          ball_speed: number | null
          carry: number | null
          club_path: number | null
          club_speed: number | null
          club_type: string | null
          created_at: string
          descent_angle: number | null
          face_angle: number | null
          face_to_path: number | null
          id: string
          launch_angle: number | null
          launch_direction: number | null
          raw: Json | null
          session_id: string
          shot_number: number | null
          shot_timestamp: string | null
          side_carry: number | null
          side_spin: number | null
          side_total: number | null
          smash_factor: number | null
          spin_axis: number | null
          spin_rate: number | null
          total: number | null
        }
        Insert: {
          angle_of_attack?: number | null
          apex_height?: number | null
          back_spin?: number | null
          ball_speed?: number | null
          carry?: number | null
          club_path?: number | null
          club_speed?: number | null
          club_type?: string | null
          created_at?: string
          descent_angle?: number | null
          face_angle?: number | null
          face_to_path?: number | null
          id?: string
          launch_angle?: number | null
          launch_direction?: number | null
          raw?: Json | null
          session_id: string
          shot_number?: number | null
          shot_timestamp?: string | null
          side_carry?: number | null
          side_spin?: number | null
          side_total?: number | null
          smash_factor?: number | null
          spin_axis?: number | null
          spin_rate?: number | null
          total?: number | null
        }
        Update: {
          angle_of_attack?: number | null
          apex_height?: number | null
          back_spin?: number | null
          ball_speed?: number | null
          carry?: number | null
          club_path?: number | null
          club_speed?: number | null
          club_type?: string | null
          created_at?: string
          descent_angle?: number | null
          face_angle?: number | null
          face_to_path?: number | null
          id?: string
          launch_angle?: number | null
          launch_direction?: number | null
          raw?: Json | null
          session_id?: string
          shot_number?: number | null
          shot_timestamp?: string | null
          side_carry?: number | null
          side_spin?: number | null
          side_total?: number | null
          smash_factor?: number | null
          spin_axis?: number | null
          spin_rate?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "range_shots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "range_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_clips: {
        Row: {
          created_at: string | null
          created_by: string | null
          download_url: string | null
          end_seconds: number
          error: string | null
          id: string
          label: string | null
          playback_url: string | null
          recording_session_id: string
          start_seconds: number
          status: string
          stream_clip_uid: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          download_url?: string | null
          end_seconds: number
          error?: string | null
          id?: string
          label?: string | null
          playback_url?: string | null
          recording_session_id: string
          start_seconds: number
          status?: string
          stream_clip_uid?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          download_url?: string | null
          end_seconds?: number
          error?: string | null
          id?: string
          label?: string | null
          playback_url?: string | null
          recording_session_id?: string
          start_seconds?: number
          status?: string
          stream_clip_uid?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recording_clips_recording_session_id_fkey"
            columns: ["recording_session_id"]
            isOneToOne: false
            referencedRelation: "recording_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_holes: {
        Row: {
          chapter_marked_at: string | null
          clip_end_seconds: number | null
          clip_start_seconds: number | null
          created_at: string
          hole_completed_at: string | null
          hole_number: number
          id: string
          par: number | null
          pre_existing: boolean
          recording_session_id: string
          score: number | null
          shot_timeline: Json
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          chapter_marked_at?: string | null
          clip_end_seconds?: number | null
          clip_start_seconds?: number | null
          created_at?: string
          hole_completed_at?: string | null
          hole_number: number
          id?: string
          par?: number | null
          pre_existing?: boolean
          recording_session_id: string
          score?: number | null
          shot_timeline?: Json
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          chapter_marked_at?: string | null
          clip_end_seconds?: number | null
          clip_start_seconds?: number | null
          created_at?: string
          hole_completed_at?: string | null
          hole_number?: number
          id?: string
          par?: number | null
          pre_existing?: boolean
          recording_session_id?: string
          score?: number | null
          shot_timeline?: Json
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recording_holes_recording_session_id_fkey"
            columns: ["recording_session_id"]
            isOneToOne: false
            referencedRelation: "recording_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_sessions: {
        Row: {
          bay_number: number
          booking_id: string | null
          created_at: string
          ended_at: string | null
          error_message: string | null
          file_size_bytes: number | null
          id: string
          last_progress_at: string | null
          mkv_path: string | null
          partial: boolean
          player_name: string | null
          retention_until: string | null
          round_number: number
          scorecard: Json | null
          sgt_tournament_id: string | null
          sgt_user_id: string | null
          started_at: string | null
          status: string
          stream_created_at: string | null
          stream_error: string | null
          stream_status: string | null
          stream_uid: string | null
          tournament_name: string | null
          trigger_source: string
          updated_at: string
        }
        Insert: {
          bay_number: number
          booking_id?: string | null
          created_at?: string
          ended_at?: string | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          last_progress_at?: string | null
          mkv_path?: string | null
          partial?: boolean
          player_name?: string | null
          retention_until?: string | null
          round_number?: number
          scorecard?: Json | null
          sgt_tournament_id?: string | null
          sgt_user_id?: string | null
          started_at?: string | null
          status?: string
          stream_created_at?: string | null
          stream_error?: string | null
          stream_status?: string | null
          stream_uid?: string | null
          tournament_name?: string | null
          trigger_source?: string
          updated_at?: string
        }
        Update: {
          bay_number?: number
          booking_id?: string | null
          created_at?: string
          ended_at?: string | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          last_progress_at?: string | null
          mkv_path?: string | null
          partial?: boolean
          player_name?: string | null
          retention_until?: string | null
          round_number?: number
          scorecard?: Json | null
          sgt_tournament_id?: string | null
          sgt_user_id?: string | null
          started_at?: string | null
          status?: string
          stream_created_at?: string | null
          stream_error?: string | null
          stream_status?: string | null
          stream_uid?: string | null
          tournament_name?: string | null
          trigger_source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recording_sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      sgt_api_config: {
        Row: {
          api_key: string
          created_at: string
          expires_at: string
          id: string
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          expires_at: string
          id?: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          expires_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sgt_club_config: {
        Row: {
          club_url: string
          created_at: string
          credentials_valid: boolean
          id: string
          last_error: string | null
          last_verified_at: string | null
          sgt_password: string | null
          sgt_username: string | null
          updated_at: string
        }
        Insert: {
          club_url?: string
          created_at?: string
          credentials_valid?: boolean
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          sgt_password?: string | null
          sgt_username?: string | null
          updated_at?: string
        }
        Update: {
          club_url?: string
          created_at?: string
          credentials_valid?: boolean
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          sgt_password?: string | null
          sgt_username?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sgt_courses: {
        Row: {
          city: string | null
          country: string | null
          course_designer: string | null
          course_id: number
          course_key: string | null
          course_location: string | null
          created_at: string
          description: string | null
          difficulty: number | null
          elevation_in_feet: number | null
          id: string
          name: string
          par: number | null
          state: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          course_designer?: string | null
          course_id: number
          course_key?: string | null
          course_location?: string | null
          created_at?: string
          description?: string | null
          difficulty?: number | null
          elevation_in_feet?: number | null
          id?: string
          name: string
          par?: number | null
          state?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          country?: string | null
          course_designer?: string | null
          course_id?: number
          course_key?: string | null
          course_location?: string | null
          created_at?: string
          description?: string | null
          difficulty?: number | null
          elevation_in_feet?: number | null
          id?: string
          name?: string
          par?: number | null
          state?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sgt_handicap_settings: {
        Row: {
          best_rounds_count: number
          created_at: string
          id: string
          rounds_required: number
          updated_at: string
          use_custom_hcp: boolean
        }
        Insert: {
          best_rounds_count?: number
          created_at?: string
          id?: string
          rounds_required?: number
          updated_at?: string
          use_custom_hcp?: boolean
        }
        Update: {
          best_rounds_count?: number
          created_at?: string
          id?: string
          rounds_required?: number
          updated_at?: string
          use_custom_hcp?: boolean
        }
        Relationships: []
      }
      sgt_members: {
        Row: {
          created_at: string
          exempt_from_cleanup: boolean
          id: string
          updated_at: string
          user_active: number
          user_country_code: string | null
          user_email: string | null
          user_game_id: string | null
          user_has_avatar: string | null
          user_id: number
          user_name: string
        }
        Insert: {
          created_at?: string
          exempt_from_cleanup?: boolean
          id?: string
          updated_at?: string
          user_active?: number
          user_country_code?: string | null
          user_email?: string | null
          user_game_id?: string | null
          user_has_avatar?: string | null
          user_id: number
          user_name: string
        }
        Update: {
          created_at?: string
          exempt_from_cleanup?: boolean
          id?: string
          updated_at?: string
          user_active?: number
          user_country_code?: string | null
          user_email?: string | null
          user_game_id?: string | null
          user_has_avatar?: string | null
          user_id?: number
          user_name?: string
        }
        Relationships: []
      }
      sgt_monthly_awards: {
        Row: {
          awarded_at: string
          awarded_by: string | null
          created_at: string | null
          id: string
          month: string
          notes: string | null
          prize_description: string | null
          tour_id: number
          winner_player_id: number | null
          winner_player_name: string
          winner_profile_user_id: string | null
        }
        Insert: {
          awarded_at?: string
          awarded_by?: string | null
          created_at?: string | null
          id?: string
          month: string
          notes?: string | null
          prize_description?: string | null
          tour_id: number
          winner_player_id?: number | null
          winner_player_name: string
          winner_profile_user_id?: string | null
        }
        Update: {
          awarded_at?: string
          awarded_by?: string | null
          created_at?: string | null
          id?: string
          month?: string
          notes?: string | null
          prize_description?: string | null
          tour_id?: number
          winner_player_id?: number | null
          winner_player_name?: string
          winner_profile_user_id?: string | null
        }
        Relationships: []
      }
      sgt_monthly_standings: {
        Row: {
          best_gross: number | null
          best_net: number | null
          created_at: string
          gross_position: number | null
          id: string
          month: string
          monthly_gross_points: number
          monthly_net_points: number
          net_position: number | null
          player_id: number
          player_name: string
          total_gross_score: number | null
          total_net_score: number | null
          tour_id: number
          tournaments_played: number
          updated_at: string
        }
        Insert: {
          best_gross?: number | null
          best_net?: number | null
          created_at?: string
          gross_position?: number | null
          id?: string
          month: string
          monthly_gross_points?: number
          monthly_net_points?: number
          net_position?: number | null
          player_id: number
          player_name: string
          total_gross_score?: number | null
          total_net_score?: number | null
          tour_id: number
          tournaments_played?: number
          updated_at?: string
        }
        Update: {
          best_gross?: number | null
          best_net?: number | null
          created_at?: string
          gross_position?: number | null
          id?: string
          month?: string
          monthly_gross_points?: number
          monthly_net_points?: number
          net_position?: number | null
          player_id?: number
          player_name?: string
          total_gross_score?: number | null
          total_net_score?: number | null
          tour_id?: number
          tournaments_played?: number
          updated_at?: string
        }
        Relationships: []
      }
      sgt_notification_settings: {
        Row: {
          created_at: string
          id: string
          new_member_email_enabled: boolean
          notification_email: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_member_email_enabled?: boolean
          notification_email?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          new_member_email_enabled?: boolean
          notification_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sgt_scorecards: {
        Row: {
          course_name: string | null
          created_at: string
          hcp_index: number | null
          hole_data: Json | null
          id: string
          in_gross: number | null
          in_net: number | null
          out_gross: number | null
          out_net: number | null
          player_id: number
          player_name: string
          rating: number | null
          round: number | null
          slope: number | null
          teetype: string | null
          to_par_gross: number | null
          to_par_net: number | null
          total_gross: number | null
          total_net: number | null
          tournament_id: number
          updated_at: string
        }
        Insert: {
          course_name?: string | null
          created_at?: string
          hcp_index?: number | null
          hole_data?: Json | null
          id?: string
          in_gross?: number | null
          in_net?: number | null
          out_gross?: number | null
          out_net?: number | null
          player_id: number
          player_name: string
          rating?: number | null
          round?: number | null
          slope?: number | null
          teetype?: string | null
          to_par_gross?: number | null
          to_par_net?: number | null
          total_gross?: number | null
          total_net?: number | null
          tournament_id: number
          updated_at?: string
        }
        Update: {
          course_name?: string | null
          created_at?: string
          hcp_index?: number | null
          hole_data?: Json | null
          id?: string
          in_gross?: number | null
          in_net?: number | null
          out_gross?: number | null
          out_net?: number | null
          player_id?: number
          player_name?: string
          rating?: number | null
          round?: number | null
          slope?: number | null
          teetype?: string | null
          to_par_gross?: number | null
          to_par_net?: number | null
          total_gross?: number | null
          total_net?: number | null
          tournament_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_sgt_scorecards_tournament"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "sgt_tournaments"
            referencedColumns: ["tournament_id"]
          },
        ]
      }
      sgt_tour_members: {
        Row: {
          created_at: string
          custom_hcp: number | null
          hcp_index: number | null
          id: string
          onboarding_hcp: number | null
          tour_id: number
          updated_at: string
          user_id: number
          user_name: string | null
        }
        Insert: {
          created_at?: string
          custom_hcp?: number | null
          hcp_index?: number | null
          id?: string
          onboarding_hcp?: number | null
          tour_id: number
          updated_at?: string
          user_id: number
          user_name?: string | null
        }
        Update: {
          created_at?: string
          custom_hcp?: number | null
          hcp_index?: number | null
          id?: string
          onboarding_hcp?: number | null
          tour_id?: number
          updated_at?: string
          user_id?: number
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_sgt_tour_members_tour"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "sgt_tours"
            referencedColumns: ["tour_id"]
          },
        ]
      }
      sgt_tour_settings: {
        Row: {
          auto_register_members: boolean
          auto_register_tournaments: boolean
          created_at: string
          id: string
          tour_id: number
          updated_at: string
          use_combo_handicap: boolean
        }
        Insert: {
          auto_register_members?: boolean
          auto_register_tournaments?: boolean
          created_at?: string
          id?: string
          tour_id: number
          updated_at?: string
          use_combo_handicap?: boolean
        }
        Update: {
          auto_register_members?: boolean
          auto_register_tournaments?: boolean
          created_at?: string
          id?: string
          tour_id?: number
          updated_at?: string
          use_combo_handicap?: boolean
        }
        Relationships: []
      }
      sgt_tour_standings: {
        Row: {
          country_code: string | null
          created_at: string
          events: number | null
          first: number | null
          gross_or_net: string
          hcp: number | null
          id: string
          points: number | null
          position: number
          top10: number | null
          top5: number | null
          tour_id: number
          updated_at: string
          user_has_avatar: string | null
          user_name: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          events?: number | null
          first?: number | null
          gross_or_net?: string
          hcp?: number | null
          id?: string
          points?: number | null
          position: number
          top10?: number | null
          top5?: number | null
          tour_id: number
          updated_at?: string
          user_has_avatar?: string | null
          user_name: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          events?: number | null
          first?: number | null
          gross_or_net?: string
          hcp?: number | null
          id?: string
          points?: number | null
          position?: number
          top10?: number | null
          top5?: number | null
          tour_id?: number
          updated_at?: string
          user_has_avatar?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_sgt_tour_standings_tour"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "sgt_tours"
            referencedColumns: ["tour_id"]
          },
        ]
      }
      sgt_tournaments: {
        Row: {
          course_name: string | null
          created_at: string
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: string | null
          tour_id: number
          tournament_id: number
          updated_at: string
        }
        Insert: {
          course_name?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string | null
          tour_id: number
          tournament_id: number
          updated_at?: string
        }
        Update: {
          course_name?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string | null
          tour_id?: number
          tournament_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_sgt_tournaments_tour"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "sgt_tours"
            referencedColumns: ["tour_id"]
          },
        ]
      }
      sgt_tours: {
        Row: {
          active: number
          created_at: string
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          team_tour: number | null
          tour_id: number
          updated_at: string
        }
        Insert: {
          active?: number
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          team_tour?: number | null
          tour_id: number
          updated_at?: string
        }
        Update: {
          active?: number
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          team_tour?: number | null
          tour_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      sgt_weekly_prizes: {
        Row: {
          awarded_at: string
          created_at: string | null
          email_sent: boolean | null
          id: string
          player_id: number
          player_name: string
          prize_amount: number
          profile_user_id: string | null
          status: string
          tournament_id: number
        }
        Insert: {
          awarded_at?: string
          created_at?: string | null
          email_sent?: boolean | null
          id?: string
          player_id: number
          player_name: string
          prize_amount?: number
          profile_user_id?: string | null
          status?: string
          tournament_id: number
        }
        Update: {
          awarded_at?: string
          created_at?: string | null
          email_sent?: boolean | null
          id?: string
          player_id?: number
          player_name?: string
          prize_amount?: number
          profile_user_id?: string | null
          status?: string
          tournament_id?: number
        }
        Relationships: []
      }
      sms_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          message: string
          name: string
          template_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          message: string
          name: string
          template_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          message?: string
          name?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      staffed_hours: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_staffed: boolean
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time?: string
          id?: string
          is_staffed?: boolean
          start_time?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_staffed?: boolean
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_processed_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          door_code: string
          highlight_recording_enabled: boolean
          highlight_recording_pilot_bay: number | null
          highlight_retention_days: number
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          door_code?: string
          highlight_recording_enabled?: boolean
          highlight_recording_pilot_bay?: number | null
          highlight_retention_days?: number
          id?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          door_code?: string
          highlight_recording_enabled?: boolean
          highlight_recording_pilot_bay?: number | null
          highlight_retention_days?: number
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      table_service_hours: {
        Row: {
          close_time: string
          created_at: string
          day_of_week: number
          id: string
          is_open: boolean
          open_time: string
          updated_at: string
        }
        Insert: {
          close_time?: string
          created_at?: string
          day_of_week: number
          id?: string
          is_open?: boolean
          open_time?: string
          updated_at?: string
        }
        Update: {
          close_time?: string
          created_at?: string
          day_of_week?: number
          id?: string
          is_open?: boolean
          open_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenant_settings: {
        Row: {
          abn: string
          address_line: string
          admin_alert_email: string
          booking_domain: string
          created_at: string
          hub_domain: string
          id: string
          legal_entity: string
          postcode: string
          sender_email: string
          socials: Json
          state: string
          suburb: string
          support_email: string
          support_phone: string
          timezone: string
          updated_at: string
          venue_name: string
        }
        Insert: {
          abn?: string
          address_line?: string
          admin_alert_email?: string
          booking_domain?: string
          created_at?: string
          hub_domain?: string
          id?: string
          legal_entity?: string
          postcode?: string
          sender_email?: string
          socials?: Json
          state?: string
          suburb?: string
          support_email?: string
          support_phone?: string
          timezone?: string
          updated_at?: string
          venue_name?: string
        }
        Update: {
          abn?: string
          address_line?: string
          admin_alert_email?: string
          booking_domain?: string
          created_at?: string
          hub_domain?: string
          id?: string
          legal_entity?: string
          postcode?: string
          sender_email?: string
          socials?: Json
          state?: string
          suburb?: string
          support_email?: string
          support_phone?: string
          timezone?: string
          updated_at?: string
          venue_name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whats_on_events: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string | null
          id: string
          is_active: boolean
          is_recurring: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string | null
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string | null
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      booking_availability: {
        Row: {
          bay_id: string | null
          booking_date: string | null
          end_time: string | null
          start_time: string | null
        }
        Insert: {
          bay_id?: string | null
          booking_date?: string | null
          end_time?: string | null
          start_time?: string | null
        }
        Update: {
          bay_id?: string | null
          booking_date?: string | null
          end_time?: string | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_terms: { Args: { _version: string }; Returns: boolean }
      claim_booking_notification: {
        Args: { _booking_id: string; _notification_type: string }
        Returns: Json
      }
      cleanup_stale_pending_bookings: { Args: never; Returns: number }
      complete_booking_notification: {
        Args: {
          _email_sent?: boolean
          _gate_sms_sent?: boolean
          _last_error?: string
          _last_response?: Json
          _log_id: string
          _sms_sent?: boolean
          _status: string
        }
        Returns: undefined
      }
      consume_pack_hours: {
        Args: {
          _booking_id?: string
          _description?: string
          _hours: number
          _transaction_type?: string
          _user_id: string
        }
        Returns: number
      }
      expire_pack_lots: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_paying_member: { Args: { _user_id: string }; Returns: boolean }
      pack_hours_balance: { Args: { _user_id: string }; Returns: number }
      redeem_pack_code: { Args: { _code: string }; Returns: Json }
      restore_pack_hours: {
        Args: {
          _booking_id?: string
          _description?: string
          _hours: number
          _transaction_type?: string
          _user_id: string
        }
        Returns: number
      }
      sgt_is_full_18: {
        Args: { hole_data: Json; in_gross: number; out_gross: number }
        Returns: boolean
      }
      sgt_player_round_counts: {
        Args: never
        Returns: {
          completed_rounds: number
          player_id: number
          player_name: string
        }[]
      }
      sgt_week_round_history: {
        Args: { p_tournament_id: number }
        Returns: {
          player_id: number
          player_name: string
          prior_rounds: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
