#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Медный дракон: a copper wing catches firelight while its breath gathers
// into a descending fire squall, echoing the spell's chosen column.
float oval(vec2 p, vec2 center, vec2 radius) {
    return 1.0-smoothstep(0.48,1.0,length((p-center)/radius));
}
float hash(float x) { return fract(sin(x*127.1+83.7)*43758.5453); }
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 ab=b-a;
    return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0));
}
vec2 squallPath(float f) {
    vec2 mouth=vec2(0.362,0.250);
    vec2 bend=vec2(0.185,0.306);
    vec2 foot=vec2(0.200,0.503);
    return (1.0-f)*(1.0-f)*mouth+2.0*(1.0-f)*f*bend+f*f*foot;
}

void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.137);
    float art=smoothstep(0.143,0.153,p.y)*(1.0-smoothstep(0.530,0.541,p.y));
    art*=smoothstep(0.007,0.022,p.x)*(1.0-smoothstep(0.978,0.993,p.x));
    // Both circular protection badges and their rims remain untouched.
    art*=clamp(smoothstep(0.170,0.189,p.x)+smoothstep(0.299,0.314,p.y),0.0,1.0);
    vec3 color=scan.rgb;
    float luma=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float breath=0.62+0.38*sin(t*1.75+seed*6.2831853);
    float wing=oval(p,vec2(0.554,0.369),vec2(0.351,0.156));
    float neck=oval(p,vec2(0.499,0.236),vec2(0.148,0.087));
    float copper=smoothstep(0.014,0.15,scan.r-scan.b);
    float litScale=smoothstep(0.065,0.31,luma);

    // A warm wave follows the diagonal veins of the real folded wing.
    float scaleWave=pow(0.5+0.5*sin(p.x*18.0+p.y*31.0-t*2.4+seed*4.0),5.0);
    color+=vec3(0.19,0.064,0.012)*wing*litScale*(0.22+0.78*scaleWave);
    color+=vec3(0.13,0.034,0.008)*copper*(wing+neck*0.4)*breath;
    float wingRim=1.0-smoothstep(0.004,0.013+aa,
        segment(p,vec2(0.321,0.393),vec2(0.755,0.281)));
    color+=vec3(0.12,0.045,0.008)*wingRim*copper*(0.25+scaleWave*0.75);

    // Keep the fiery mouth and eye legible even at frozen time zero.
    float mouth=oval(p,vec2(0.369,0.248),vec2(0.033,0.026));
    float eye=oval(p,vec2(0.383,0.214),vec2(0.012,0.006));
    color+=vec3(0.55,0.17,0.018)*mouth*(0.46+0.54*breath);
    color+=vec3(0.61,0.35,0.035)*eye*(0.65+0.35*breath);

    // The flame keeps the mouth as its fixed source. Embers spread down a
    // narrow column in the empty sky, without moving any scanned pixels.
    float flame=0.0;
    float embers=0.0;
    for (int i=0;i<24;i++) {
        float fi=float(i);
        float age=fract(t*0.285+fi/24.0+seed);
        vec2 center=squallPath(age);
        center.x+=sin(age*16.0-t*2.3+fi*2.4)*0.025*age;
        center.y+=sin(age*11.0+fi)*0.005*age;
        vec2 delta=(p-center)*vec2(1.0,0.71);
        float radius=0.0018+hash(fi+1.0)*0.0024;
        float envelope=sin(age*3.14159265)*(0.42+breath*0.58);
        float d=length(delta);
        embers+=(1.0-smoothstep(radius,radius+aa,d))*envelope;
        flame+=exp(-dot(delta,delta)/(0.00010+age*0.00018))*envelope*0.15;
    }
    // Let the large black forward horn occlude the passing fire column.
    float horn=oval(p,vec2(0.228,0.327),vec2(0.052,0.091));
    float visibility=1.0-horn*(1.0-smoothstep(0.07,0.25,luma))*0.92;
    color+=vec3(0.46,0.095,0.006)*flame*visibility;
    color+=vec3(0.92,0.39,0.043)*embers*visibility;

    // The already-painted fire fractures in the clouds respond to the breath.
    float sky=(1.0-wing)*(1.0-neck);
    float fireInk=smoothstep(0.19,0.42,scan.r-scan.b)*smoothstep(0.28,0.60,luma);
    float skyPulse=0.5+0.5*sin(p.x*12.0-t*3.1+seed*6.0);
    color+=vec3(0.23,0.075,0.013)*fireInk*sky*(0.35+0.65*skyPulse);

    if (u_is_foil) {
        // Broad copper/verdigris interference follows the folded metal wing;
        // a fixed emboss survives reduced motion and smaller listing renders.
        float finish=0.32+wing*0.40+neck*0.14;
        float phase=p.x*1.55+p.y*2.70+t*0.13+seed*0.45
                   +0.09*sin(p.x*17.0+p.y*21.0);
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.333,0.667)));
        vec3 coated=mix(2.0*color*spectrum,
            1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,coated,finish*0.57);
        float sheen=pow(0.5+0.5*sin(p.x*11.0+p.y*17.0-t*1.35+seed),8.0);
        color+=(1.0-color)*(vec3(0.035,0.024,0.012)+spectrum*0.15)*finish;
        color+=(1.0-color)*mix(vec3(1.0,0.61,0.26),spectrum,0.54)
               *sheen*finish*(0.21+litScale*0.23);
        color+=vec3(0.09,0.039,0.012)*wingRim*(0.4+sheen*0.6);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
