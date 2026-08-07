INSERT INTO public.email_layout (id, header_html, footer_html)
VALUES (
  'global',
  '<tr>
  <td align="center" style="background-color:#2E3032; padding:22px; border-radius:16px 16px 0 0;">
    <img src="https://urbanfairways.lovable.app/__l5e/assets-v1/95842b02-e160-42b4-a144-568773f3de07/uf-email-logo.png" width="260" alt="{{venue_name}}" style="display:block; width:260px; max-width:80%; height:auto; border:0;" />
  </td>
</tr>',
  '<tr>
  <td style="background-color:#2E3032; padding:22px; border-radius:0 0 16px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="font-family:Montserrat, Arial, sans-serif; font-size:14px; line-height:1.7; color:#FFFFFF;">
          <div><a href="https://www.google.com/maps/search/?api=1&query={{address}}" style="color:#FFFFFF; text-decoration:underline;">{{address}}</a></div>
          <div><a href="mailto:{{support_email}}" style="color:#FFFFFF; text-decoration:underline;">{{support_email}}</a></div>
          <div><a href="https://{{booking_domain}}" style="color:#FFFFFF; text-decoration:underline;">{{booking_domain}}</a></div>
          <div style="margin-top:10px; font-size:12px; opacity:0.75;">&copy; {{venue_name}}</div>
        </td>
      </tr>
    </table>
  </td>
</tr>'
)
ON CONFLICT (id) DO UPDATE
SET header_html = EXCLUDED.header_html,
    footer_html = EXCLUDED.footer_html,
    updated_at = now();