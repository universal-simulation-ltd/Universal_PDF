## Key 
* Task
** Important / difficult task - Be careful

## Question - Don't do
* Is it difficult to build a webpage that shows calendar availability across my Google Calendars or is it better to use an existing solution?

## UNI SIM website
* Add pricing back into the navigation bar
* In the contact form remove the 'i'm interested in' box

## UNI SIM Central (logins)
* If someone logs in, they must have an active subscription.
* Make me a lifetime master subscription (James@unisim.co.uk) and I need to have a page where I can allocate users tokens (exports) and subscriptions (with a custom end date) via a coupon code. Then when they create an account it will ask them for their coupon code to activate a license before they start giving details. Otherwise they should be directed towards the pricing page to purchase a subscription. Are we able to automise it so when they purchase on Stripe they get sent a coupon code? I forget if we already did this for an earlier version of Ergo Assess.

## Global Navigation / Settings
* The universal nav bar should have been updated for the app logo to go to the app homepage and in the dropdown to have "Universal Simulation The Assess suite" as a live button that goes to the assess portal in the same style as the other buttons using the UNI SIM icon as the logo
* Drop the settings button and instead add an 'App settings' to the dropdown of the user profile 
* Move the UNI SIM icon for changelog to the far far right of the screen so it's not so prominent
* Temporarlity mark Workplace Assess and Cybe Assess as 'Coming soon' in the menu and don't link to anything. We will bring them back soon.

## Universal Changelog
** Update with a few (not exhaustive) updates from each repo following the existing structure 

## Cyber Assess
* It should show 'Solo (100% FREE)' 
* Change Workshop BETA to "Teams (Paid)"
* If starting teams have a field for add team members that lets you add email addresses (turns to chips). 
* If starting an assessment on teams ask them to login / enter their coupon.
* Don't make all 5 controls obligatory, only a minmum of choosing one, just show those controls greyed out if not chosen in the workshop.
* Remove ⚠ MFA on cloud services is mandatory — failure = automatic certification fail
* New Assessment should go back to the landing page 
* Get rid of the "<-- all assessments' and bring the "> Workshops" up to this navigation after the project name
* Remove the licensing at the bottom of landing page 
** Check all of the knowledge base links, make sure there's a page for each with details and a worksheet / guide to be downloadable. Use colours and SVG images to make it visually appealing. 

## Workplace Assess
* It should show 'FREE TRIAL VERSION' on the landing page if they are not logged in where the old chip used to be saying something like '1 Free export'
* Change the name to WFH Assess as it's becoming clear this is the target market for companies to provide checks on staff working from home as opposed to working paces in general.

## Universal Apps (PDF etc)
** Reuse the universal nav bar but link it to the type of apps. I.e. With Universal PDF when hovering the logo show the dropdown with other free Universal Apps (webinar, exports / imports, Images and, soon, emailer). Then a file dropdown for the functionality that's currently on the logo (open new pdf or similar). Far right have the UNI SIM logo and dropdown with changelog as per existing behaviour. Settings and profile can be as is, with the profile only allowing guest (they can't create an account). 
The top item (where it says Universal Simulation The Assess suite) of the logo dropdown should be the link to the portal for that category. I.e. Assess with cyber, workplace, ergo or Universal Apps portal (to be created) with pdf, webinar etc.

## Universal Apps portal

Use the same template as assess portal, no sign in link as not needed. At the bottom show a small card linking to each products Github repo.

## Ergo Assess

On new assessment use 'Video', 'Motion Capture', 'Webcam'
By default have RULA selected as a chip but not REBA
* Each knowledge page needs an SVG. E.g. on NIOSH it could be of a person picking up a box. They should have some sort of mouse hover interactivity and animation.
* On the BVH upload tab, have the left half as upload BVH (with an SVG icon of someone running) and the right half as Upload Video with a video icon. BVH is obligatory but it should be very clear that the video is optional.
** If they chose BVH without the video then have a button to open up the 'attach a companion video' but make it fairly small as they originally chose not to.
* The video on video only (not BVH) is still showing the lines of the skeleton during playback as opposed to the original video prior to treatment. Please fix.
** The annotations tab quickly gets very convuluted. Do you have any suggestions to improve this? Maybe the full list could also be collapsible (is it even needed?) and the user has the edit / delete buttons on the currently viewable list of annotations too.
* Taking more screenshots in the example project but it only showed the 3 example ones at the export popup. It should show all available screenshots, please fix.
* Make the BVH body silhouette a little bit thinner than currently 
* When opening a collapsible scroll the screen down if the collapsible opens content offscreen
* Some of the knowledge pages don't have a pastel (and slightly contrasting) bg colour for the title section. E.g. on the RULA page, it looks like the same bg as the page bg.
* Add "About Universal Simulation" to the knowledge base as an example page under 'Company Knowledge' when user is not logged in. Create the page with general information and images from unisim.co.uk as well as their founder, James Markey. When logged in replace it with "About [their company]"  
* Add a 'Motion Capture' example underneath 'try a live example' in a different colour and use the SVG person icon. 
** Question: If a guest uploads a video, is it hosted on our server? If so, we need to look at reducing filesize for guests and restrict the number of uploads too.
* Either way, I think it's a good idea to have guest limits. Say 'Trial limit: 20mb' on video and BVH (total BVH + Video). We should also limit them to one upload of each video and BVH. If they try a second time popup saying 'Free trial ended. Try our example project or check out our pricing to unlock more'.
** Question: How difficult would it be to produce a Windows application of this website so it all runs locally on a client's computer?
* On all worksheets and guides don't open up the print to pdf window just open up the page and have a 'print page' button next to a printer icon. Don't show the navigation bar but DO show the light bar still.
* On all worksheets add in images (SVGs?) at each part. E.g. If a section is for 'Arm & Wrist' then show an image to represent this. It could also be a semi-transparent image as the bg and they write on top of it for the worksheet 
* Update the video page with the changes made to face risk / body parts on BVH. I.E have ergonomic scores and body part angles on one line. 
** Show passive exoskeleton as an assist suggestion only if they video includes manual handling (context given or relevant label e.g. niosh)
* In Methods validated, are there any papers which validate the mediapipe technology we use, or anything else that would be useful?