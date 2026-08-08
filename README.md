# Urban Fairways

We want to create a Birdies booking platform. 
This is a big project so I would appreciate a staged approach. Let me know the best way to go about it. 

Here are the basic things it will need:
1. Booking portal for customers to book our golf simulator bays (6 bays), stripe billing, weekly memberships, customer login etc
2. There are two sides to the platform, customer zone which allows their access to the platform, then our internal admin access will provide all the management of customers, billing, memberships, booking management, marketing 
3. Pricing wise we need to tag customers based on their status, for eg, Visitor (non member), Par member, birdie member. The tags are used so that we can dictate the prices to each customer. 
4. Memberships are available where a customer signs up to the package that suits them. For example, par member is $15 per week, which changes your hourly rate to $12. Birdie is $20 per week, $10 per hour. Eagle $25 / $9 . Albatross $35 / $8   
5. The bookings would be in 1 hour increments with the booking table being in 30 minute slots so you can only book on the hour and every half hour. You can book 1, 2, 3, and 4 hour slots. 
6. Some additional features: Dynamic pricing (allow setting of pricing for any customers), customer management based on any factor with easy filtering to market to particular customers. API access is a must. We need to be able to pull the booking data so we can use in our bays to automate the bays based of booking start times. The api should show all of the booking information such as name, contact, membership tier etc.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://urbanfairways.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d1fed7cf-837e-46a1-8231-332da0df8f60).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
